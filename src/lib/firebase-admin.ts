import 'server-only'
import { initializeApp, cert, getApps, getApp, type App } from 'firebase-admin/app'
import { getAuth, type Auth, type DecodedIdToken } from 'firebase-admin/auth'

/**
 * Sanitizes a PEM private key from environment variables:
 * - Strips leading/trailing double or single quotes (often added by Vercel UI or shell imports).
 * - Replaces literal '\n' and '\r\n' sequences with real newlines.
 * - Trims whitespace.
 */
export function sanitizePrivateKey(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  let key = raw.trim()

  // Strip wrapping double or single quotes
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim()
  }

  // Replace literal \r\n and \n escapes with actual newlines
  key = key.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\r\n/g, '\n')

  return key
}

/**
 * Safely parses non-sensitive JWT metadata for debugging without exposing secrets.
 */
export function parseTokenSafeMetadata(token: string) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      return { isJwt: false, length: token.length, prefix: token.slice(0, 10) }
    }
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return {
      isJwt: true,
      length: token.length,
      iss: payload.iss,
      aud: payload.aud,
      sub: payload.sub ? `${payload.sub.slice(0, 4)}...${payload.sub.slice(-4)}` : undefined,
      auth_time: payload.auth_time,
      iat: payload.iat,
      exp: payload.exp,
      isExpired: payload.exp ? payload.exp * 1000 < Date.now() : undefined,
    }
  } catch {
    return { isJwt: false, length: token.length }
  }
}

/**
 * Strips whitespace and wrapping quotes from environment variable values.
 */
export function cleanEnvValue(val?: string): string | undefined {
  if (!val) return undefined
  let clean = val.trim()
  if (
    (clean.startsWith('"') && clean.endsWith('"')) ||
    (clean.startsWith("'") && clean.endsWith("'"))
  ) {
    clean = clean.slice(1, -1).trim()
  }
  return clean || undefined
}

// Check for JSON service account credentials
let serviceAccountJson: { project_id?: string; client_email?: string; private_key?: string } | null = null
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT || ''
    serviceAccountJson = JSON.parse(raw)
  } catch {}
}

const projectId =
  cleanEnvValue(serviceAccountJson?.project_id) ||
  cleanEnvValue(process.env.FIREBASE_ADMIN_PROJECT_ID) ||
  cleanEnvValue(process.env.FIREBASE_PROJECT_ID) ||
  cleanEnvValue(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) ||
  (process.env.NODE_ENV !== 'production' ? 'zuulab-1c82c' : undefined)

const clientEmail =
  cleanEnvValue(serviceAccountJson?.client_email) ||
  cleanEnvValue(process.env.FIREBASE_ADMIN_CLIENT_EMAIL) ||
  cleanEnvValue(process.env.FIREBASE_CLIENT_EMAIL) ||
  (process.env.NODE_ENV !== 'production'
    ? 'firebase-adminsdk-fbsvc@zuulab-1c82c.iam.gserviceaccount.com'
    : undefined)

const rawPrivateKey =
  serviceAccountJson?.private_key ||
  process.env.FIREBASE_ADMIN_PRIVATE_KEY ||
  process.env.FIREBASE_PRIVATE_KEY

const sanitizedPrivateKey = sanitizePrivateKey(rawPrivateKey)

export const isFirebaseAdminConfigured = Boolean(
  projectId && clientEmail && sanitizedPrivateKey && !projectId.includes('your-')
)

function getFirebaseAdminApp(): App | null {
  if (getApps().length > 0) return getApp()

  if (!isFirebaseAdminConfigured || !sanitizedPrivateKey) {
    if (process.env.NODE_ENV === 'production') {
      console.error(
        '[Firebase Admin] CRITICAL CONFIGURATION ERROR: Missing required Firebase Admin credentials in production.',
        {
          hasProjectId: Boolean(projectId),
          hasClientEmail: Boolean(clientEmail),
          hasPrivateKey: Boolean(sanitizedPrivateKey),
        }
      )
    }
    return null
  }

  try {
    return initializeApp({
      credential: cert({
        projectId: projectId,
        clientEmail: clientEmail,
        privateKey: sanitizedPrivateKey,
      }),
    })
  } catch (error) {
    console.error('[Firebase Admin] Initialization error:', error)
    return null
  }
}

let _adminApp: App | null = null
let _adminAuth: Auth | null = null

export function getAdminAuth(): Auth | null {
  if (_adminAuth) return _adminAuth
  _adminApp = getFirebaseAdminApp()
  if (_adminApp) {
    _adminAuth = getAuth(_adminApp)
    return _adminAuth
  }
  return null
}

export const adminAuth: Auth | null = getAdminAuth()

/**
 * Verifies a Firebase ID token from client Authorization header
 * Supports mock development token only in non-production environments.
 */
export async function verifyAuthToken(
  token: string
): Promise<DecodedIdToken | null> {
  if (!token) return null

  // 1. Dev token handling for local/test environments
  if (token.startsWith('dev-token-') || token.startsWith('dev-token:')) {
    if (process.env.NODE_ENV !== 'production') {
      const parts = token.split(':')
      let uid = 'dev-customer-uid'
      let email = 'demo@zuulab.com'
      let role = 'CUSTOMER'

      let storeId: string | undefined = undefined
      if (parts.length >= 5) {
        uid = parts[1] || uid
        email = parts[2] || email
        role = parts[3] || role
        storeId = parts[4] || undefined
      } else if (parts.length >= 4) {
        uid = parts[1] || uid
        email = parts[2] || email
        role = parts[3] || role
      } else if (parts.length === 3) {
        uid = parts[0].replace(/^dev-token[:-]?/, '') || uid
        email = parts[1] || email
        role = parts[2] || role
      }
      return {
        uid,
        email,
        email_verified: true,
        auth_time: Math.floor(Date.now() / 1000),
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        aud: projectId,
        iss: `https://securetoken.google.com/${projectId}`,
        sub: uid,
        firebase: { identities: {}, sign_in_provider: 'custom' },
        role,
        storeId,
      } as any
    }
    return null
  }

  // 2. Safe metadata extraction for diagnostics
  const safeMeta = parseTokenSafeMetadata(token)

  // 3. Cryptographic verification with Firebase Admin
  const authInstance = getAdminAuth()
  if (authInstance) {
    try {
      const decoded = await authInstance.verifyIdToken(token)
      return decoded
    } catch (err: any) {
      console.warn('[Firebase Admin] Token verification failed:', {
        code: err.code,
        message: err.message,
        safeMeta,
      })

      // Clock skew tolerance: if token auth_time is in the future by <= 60 seconds due to NTP drift
      if (
        (err.message?.includes('auth_time') || err.code === 'auth/id-token-issued-in-the-future') &&
        safeMeta.auth_time &&
        Math.abs(Date.now() / 1000 - safeMeta.auth_time) < 60
      ) {
        try {
          const decoded = await authInstance.verifyIdToken(token, false)
          return decoded
        } catch {}
      }

      return null
    }
  } else {
    console.error('[Firebase Admin] adminAuth is not configured or failed to initialize!', {
      hasProjectId: Boolean(projectId),
      hasClientEmail: Boolean(clientEmail),
      hasPrivateKey: Boolean(sanitizedPrivateKey),
      safeMeta,
    })
  }

  return null
}
