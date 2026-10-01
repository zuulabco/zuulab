import 'server-only'
import { verifyAuthToken } from '@/lib/firebase-admin'
import { db, isDatabaseConfigured } from '@/prisma/db'

export interface AuthUser {
  id: string
  firebaseUid: string
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
  if (bearer !== 'Bearer' || !token) return null
  return token
}

/**
 * Verifies token from incoming HTTP Request and retrieves the corresponding DB User
 */
export async function authenticateRequest(
  request: Request
): Promise<AuthUser | null> {
  const token = extractBearerToken(request)
  if (!token) return null

  const decoded = await verifyAuthToken(token)
  if (!decoded || !decoded.uid) return null

  return syncOrCreateUser({
    firebaseUid: decoded.uid,
    email: decoded.email || `${decoded.uid}@zuulab.user`,
    name: (decoded.name as string) || null,
    avatar: (decoded.picture as string) || null,
    roleOverride: (decoded.role as AuthUser['role']) || undefined,
    storeId: (decoded as any).storeId || undefined,
  })
}

/**
 * Finds or creates User in PostgreSQL (or fallback memory)
 */
export async function syncOrCreateUser(payload: {
  firebaseUid: string
  email: string
  name?: string | null
  avatar?: string | null
  roleOverride?: AuthUser['role']
  storeId?: string | null
}): Promise<AuthUser> {
  const { firebaseUid, email, name, avatar, roleOverride, storeId } = payload

  // Check if email matches designated admin
  const isAdminEmail =
    email.toLowerCase() === 'admin@zuulab.com' ||
    roleOverride === 'ADMIN'

  const targetRole: AuthUser['role'] = roleOverride || (isAdminEmail ? 'ADMIN' : 'CUSTOMER')

  if (isDatabaseConfigured) {
    try {
      // Find existing user by firebaseUid or email
      const existing = await db.orm.public.User.where({
        firebaseUid,
      }).first()

      if (existing) {
        // Update last login
        await db.orm.public.User.where({ id: existing.id }).update({
          lastLoginAt: new Date(),
          name: name || existing.name,
          avatar: avatar || existing.avatar,
        })
        return {
          id: existing.id,
          firebaseUid: existing.firebaseUid,
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
        email,
        name: name || null,
        avatar: avatar || null,
        role: targetRole,
        status: 'ACTIVE',
        emailVerified: true,
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
      console.warn('[auth.service] Database query failed, using memory fallback:', err)
    }
  }

  // Fallback in-memory
  let user = inMemoryUsers.get(firebaseUid)
  if (!user || (storeId !== undefined && user.storeId !== storeId)) {
    user = {
      id: `usr-${firebaseUid.slice(0, 10)}`,
      firebaseUid,
      email,
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
