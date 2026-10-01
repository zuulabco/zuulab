import 'server-only'
import { initializeApp, cert, getApps, getApp, type App } from 'firebase-admin/app'
import { getAuth, type Auth, type DecodedIdToken } from 'firebase-admin/auth'

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY

export const isFirebaseAdminConfigured = Boolean(
  projectId && clientEmail && privateKey && !projectId.includes('your-')
)

function getFirebaseAdminApp(): App | null {
  if (getApps().length > 0) return getApp()

  if (!isFirebaseAdminConfigured) {
    return null
  }

  try {
    return initializeApp({
      credential: cert({
        projectId: projectId,
        clientEmail: clientEmail,
        privateKey: privateKey?.replace(/\\n/g, '\n'),
      }),
    })
  } catch (error) {
    console.error('[Firebase Admin] Initialization error:', error)
    return null
  }
}

const adminApp = getFirebaseAdminApp()
export const adminAuth: Auth | null = adminApp ? getAuth(adminApp) : null

/**
 * Verifies a Firebase ID token from client Authorization header
 * Supports mock development token if admin credentials are not set
 */
export async function verifyAuthToken(
  token: string
): Promise<DecodedIdToken | null> {
  if (!token) return null

  // If real Firebase Admin is configured, verify cryptographically
  if (adminAuth) {
    try {
      const decoded = await adminAuth.verifyIdToken(token)
      return decoded
    } catch (err) {
      console.warn('[Firebase Admin] Token verification failed:', err)
      return null
    }
  }

  // Development fallback: If testing locally without Firebase Admin service account keys
  if (process.env.NODE_ENV !== 'production') {
    // If token starts with "dev-token-", decode mock payload
    if (token.startsWith('dev-token-') || token.startsWith('dev-token:')) {
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
        aud: 'zuulab-e',
        iss: 'https://securetoken.google.com/zuulab-e',
        sub: uid,
        firebase: { identities: {}, sign_in_provider: 'custom' },
        role,
        storeId,
      } as any
    }
  }

  return null
}
