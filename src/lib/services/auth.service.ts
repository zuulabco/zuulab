import 'server-only'
import { verifyAuthToken } from '@/lib/firebase-admin'
import { isSignInFromEarlierDay } from '@/lib/auth/daily-session'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { extractSessionCookie, verifySessionToken } from './session.service'

export interface AuthUser {
  id: string
  firebaseUid: string | null
  email: string
  name: string | null
  avatar: string | null
  role:
    | 'CUSTOMER'
    | 'ADMIN'
    | 'SUPER_ADMIN'
    | 'STAFF'
    | 'SUPPORT'
    | 'CONTENT_MANAGER'
    | 'ORDER_MANAGER'
  status: string
  storeId?: string | null
}

// In-memory fallback for local dev when PostgreSQL is not configured
const inMemoryUsers: Map<string, AuthUser> = new Map([
  [
    'admin-firebase-uid',
    {
      id: 'usr-admin-demo',
      firebaseUid: 'admin-firebase-uid',
      email: 'admin@zuulab.com',
      name: 'Zuulab Admin',
      avatar: null,
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  ],
])

/**
 * Extracts Bearer token from Request Authorization header
 */
export function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader) return null
  const [bearer, token] = authHeader.split(' ')
  if (bearer !== 'Bearer' || !token || token === 'null' || token === 'undefined') return null
  return token
}

/**
 * Retrieves a user by their database ID from PostgreSQL (or memory fallback).
 */
export async function getUserById(id: string): Promise<AuthUser | null> {
  if (isDatabaseConfigured) {
    try {
      const user = await db.orm.public.User.where({ id }).first()
      if (user) {
        return {
          id: user.id,
          firebaseUid: user.firebaseUid,
          email: user.email,
          name: user.name || null,
          avatar: user.avatar || null,
          role: (user.role as AuthUser['role']) || 'CUSTOMER',
          status: user.status || 'ACTIVE',
          storeId: (user as any).storeId || null,
        }
      }
    } catch (err) {
      console.warn('[auth.service] getUserById failed:', err)
    }
  }

  // Fallback in-memory
  for (const [, user] of inMemoryUsers) {
    if (user.id === id) return user
  }
  return null
}

/**
 * Verifies token or session cookie from incoming HTTP Request and retrieves the corresponding DB User
 */
export async function authenticateRequest(
  request: Request
): Promise<AuthUser | null> {
  // 1. Try Bearer token first (client Firebase ID token)
  const token = extractBearerToken(request)
  if (token) {
    const decoded = await verifyAuthToken(token)
    // Sign-ins end at midnight (Türkiye): Firebase keeps refreshing the token, but its
    // auth_time stays the moment the user logged in
    if (decoded && decoded.uid && isSignInFromEarlierDay((decoded.auth_time || 0) * 1000)) {
      return null
    }
    if (decoded && decoded.uid) {
      return syncOrCreateUser({
        firebaseUid: decoded.uid,
        email: decoded.email || `${decoded.uid}@zuulab.user`,
        emailVerified: decoded.email_verified === true,
        name: (decoded.name as string) || null,
        avatar: (decoded.picture as string) || null,
        roleOverride: (decoded.role as AuthUser['role']) || undefined,
        storeId: (decoded as any).storeId || undefined,
      }).catch((err) => {
        if (err instanceof AuthSyncError && err.code === 'EMAIL_NOT_VERIFIED') return null
        throw err
      })
    }
  }

  // 2. Try cross-subdomain session cookie (zuulab_session)
  const sessionToken = extractSessionCookie(request)
  if (sessionToken) {
    const sessionPayload = verifySessionToken(sessionToken)
    if (sessionPayload && sessionPayload.userId) {
      const user = await getUserById(sessionPayload.userId)
      if (user && user.status === 'ACTIVE') {
        return user
      }
    }
  }

  return null
}

/**
 * Emails (comma-separated) that receive the ADMIN role when their account is first
 * created. Only honoured for Firebase-verified emails, so the role cannot be claimed
 * by registering an unverified address.
 */
function isBootstrapAdminEmail(email: string): boolean {
  return (process.env.ADMIN_BOOTSTRAP_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email)
}

export class AuthSyncError extends Error {
  constructor(
    public code: 'EMAIL_NOT_VERIFIED' | 'DATABASE_UNAVAILABLE',
    message: string
  ) {
    super(message)
    this.name = 'AuthSyncError'
  }
}

/**
 * Finds or creates User in PostgreSQL (or fallback memory outside production).
 *
 * Attaching a Firebase identity to an existing record by email is the account-takeover
 * surface, so it is only allowed when Firebase has verified the email. That covers
 * guest checkout records too: they hold order history and addresses.
 */
export async function syncOrCreateUser(payload: {
  firebaseUid: string
  email: string
  emailVerified?: boolean
  name?: string | null
  avatar?: string | null
  roleOverride?: AuthUser['role']
  storeId?: string | null
}): Promise<AuthUser> {
  const { firebaseUid, email, name, avatar, roleOverride, storeId } = payload
  const emailVerified = payload.emailVerified === true
  const normalizedEmail = email.trim().toLowerCase()

  const targetRole: AuthUser['role'] =
    roleOverride || (emailVerified && isBootstrapAdminEmail(normalizedEmail) ? 'ADMIN' : 'CUSTOMER')

  if (isDatabaseConfigured) {
    try {
      let existing = await db.orm.public.User.where({
        firebaseUid,
      }).first()

      if (!existing && normalizedEmail) {
        const byEmail = await db.orm.public.User.where({
          email: normalizedEmail,
        }).first()

        if (byEmail) {
          // An existing record (guest orders, addresses, or another login) is only
          // handed to a Firebase identity that has proven it owns the address.
          if (!emailVerified) {
            throw new AuthSyncError(
              'EMAIL_NOT_VERIFIED',
              'Bu e-posta adresiyle daha önce sipariş verilmiş. Hesabınızı bağlamak için e-postanıza gönderdiğimiz doğrulama bağlantısına tıklayıp tekrar giriş yapın.'
            )
          }
          existing = byEmail
        }
      }

      if (existing) {
        const globalTemporal = (globalThis as any).Temporal
        const nowTemporal = globalTemporal ? globalTemporal.Now.plainDateTimeISO() : (new Date() as any)
        await db.orm.public.User.where({ id: existing.id }).update({
          firebaseUid,
          emailVerified: emailVerified || Boolean(existing.emailVerified),
          lastLoginAt: nowTemporal as any,
          name: name || existing.name,
          avatar: avatar || existing.avatar,
        })
        return {
          id: existing.id,
          firebaseUid,
          email: existing.email,
          name: existing.name || name || null,
          avatar: existing.avatar || avatar || null,
          role: (existing.role as AuthUser['role']) || 'CUSTOMER',
          status: existing.status || 'ACTIVE',
          storeId: storeId !== undefined ? storeId : (existing as any).storeId || null,
        }
      }

      // Create new user
      const created = await db.orm.public.User.create({
        firebaseUid,
        email: normalizedEmail,
        name: name || null,
        avatar: avatar || null,
        role: targetRole,
        status: 'ACTIVE',
        emailVerified,
      })

      return {
        id: created.id,
        firebaseUid: created.firebaseUid,
        email: created.email,
        name: created.name || null,
        avatar: created.avatar || null,
        role: targetRole,
        status: 'ACTIVE',
        storeId: storeId || null,
      }
    } catch (err) {
      if (err instanceof AuthSyncError) throw err
      // A transient DB error must never fall through to role resolution in memory.
      if (process.env.NODE_ENV === 'production') {
        console.error('[auth.service] syncOrCreateUser database error:', err)
        throw new AuthSyncError('DATABASE_UNAVAILABLE', 'Kullanıcı kaydı şu anda doğrulanamıyor.')
      }
      console.warn('[auth.service] Database query failed, using memory fallback:', err)
    }
  } else if (process.env.NODE_ENV === 'production') {
    throw new AuthSyncError('DATABASE_UNAVAILABLE', 'Kullanıcı kaydı şu anda doğrulanamıyor.')
  }

  // Fallback in-memory
  let user = inMemoryUsers.get(firebaseUid)
  if (!user || (storeId !== undefined && user.storeId !== storeId)) {
    user = {
      id: `usr-${firebaseUid.slice(0, 10)}`,
      firebaseUid,
      email: normalizedEmail,
      name: name || null,
      avatar: avatar || null,
      role: targetRole,
      status: 'ACTIVE',
      storeId: storeId !== undefined ? storeId : user?.storeId || null,
    }
    inMemoryUsers.set(firebaseUid, user)
  }
  return user
}

/**
 * Retrieves existing user by email or creates a new guest User in PostgreSQL.
 * Guest users have role: 'CUSTOMER', status: 'ACTIVE', emailVerified: false, and firebaseUid: null.
 * When they subsequently register/login with Firebase using the same email, syncOrCreateUser will
 * automatically link their firebaseUid to this record.
 */
export async function getOrCreateGuestUser(payload: {
  email: string
  fullName?: string | null
  phone?: string | null
}): Promise<{ id: string; email: string; isNew: boolean }> {
  const normalizedEmail = payload.email.trim().toLowerCase()

  if (isDatabaseConfigured) {
    try {
      const existing = await db.orm.public.User.where({
        email: normalizedEmail,
      }).first()

      if (existing) {
        return {
          id: existing.id,
          email: existing.email,
          isNew: false,
        }
      }

      const created = await db.orm.public.User.create({
        email: normalizedEmail,
        name: payload.fullName || null,
        phone: payload.phone || null,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        isActive: true,
        emailVerified: false,
      })

      return {
        id: created.id,
        email: created.email,
        isNew: true,
      }
    } catch (err) {
      // A memory-only guest id would be a dangling foreign key for the order or
      // ticket created with it.
      if (process.env.NODE_ENV === 'production') throw err
      console.warn('[auth.service] Database getOrCreateGuestUser failed, using memory fallback:', err)
    }
  } else if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_UNAVAILABLE: Müşteri kaydı oluşturulamadı.')
  }

  // Fallback in-memory
  for (const [, user] of inMemoryUsers) {
    if (user.email.toLowerCase() === normalizedEmail) {
      return { id: user.id, email: user.email, isNew: false }
    }
  }

  const memoryGuestId = `usr-guest-${Date.now()}`
  const guestUser: AuthUser = {
    id: memoryGuestId,
    firebaseUid: null,
    email: normalizedEmail,
    name: payload.fullName || null,
    avatar: null,
    role: 'CUSTOMER',
    status: 'ACTIVE',
  }
  inMemoryUsers.set(memoryGuestId, guestUser)
  return { id: memoryGuestId, email: normalizedEmail, isNew: true }
}

/**
 * Guards routes requiring any authenticated user
 */
export async function requireAuth(request: Request): Promise<AuthUser> {
  const user = await authenticateRequest(request)
  if (!user) {
    throw new Error('UNAUTHORIZED: Lütfen giriş yapın.')
  }
  return user
}

/**
 * Guards routes requiring ADMIN privileges
 */
export async function requireAdmin(request: Request): Promise<AuthUser> {
  const user = await requireAuth(request)
  if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
    throw new Error('FORBIDDEN: Bu işlem için yönetici yetkisi gereklidir.')
  }
  return user
}
