import 'server-only'
import crypto from 'crypto'

export interface SessionPayload {
  userId: string
  firebaseUid?: string | null
  email: string
  role?: string
  storeId?: string | null
  iat: number
  exp: number
}

export const SESSION_COOKIE_NAME = 'zuulab_session'
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60 // 7 days in seconds

/**
 * Resolves session secret from environment variables.
 * Falls back to a deterministic hash of FIREBASE_PRIVATE_KEY if explicit secret is not set,
 * ensuring zero runtime breakage in production if AUTH_SESSION_SECRET is omitted.
 */
function getSessionSecret(): string {
  if (process.env.AUTH_SESSION_SECRET) {
    return process.env.AUTH_SESSION_SECRET
  }
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET
  }
  if (process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY) {
    const raw = process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY || ''
    return crypto.createHash('sha256').update(raw).digest('hex')
  }
  return 'zuulab-production-session-fallback-secret-2026'
}

/**
 * Creates a cryptographically signed HMAC-SHA256 session token.
 */
export function createSessionToken(
  data: Omit<SessionPayload, 'iat' | 'exp'>,
  expiresInSeconds = SESSION_MAX_AGE
): string {
  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + expiresInSeconds
  const payload: SessionPayload = { ...data, iat, exp }

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const secret = getSessionSecret()
  const signature = crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url')

  return `${encodedPayload}.${signature}`
}

/**
 * Verifies the HMAC-SHA256 signature and expiration of a session token.
 * Uses timing-safe equality to protect against timing attacks.
 */
export function verifySessionToken(token: string): SessionPayload | null {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 2) return null

  const [encodedPayload, providedSignature] = parts
  const secret = getSessionSecret()
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(encodedPayload)
    .digest('base64url')

  const providedBuf = Buffer.from(providedSignature)
  const expectedBuf = Buffer.from(expectedSignature)

  if (providedBuf.length !== expectedBuf.length) {
    return null
  }

  if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return null
  }

  try {
    const payload: SessionPayload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    )

    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && payload.exp < now) {
      return null
    }

    return payload
  } catch {
    return null
  }
}

/**
 * Determines the cookie domain:
 * - In production for zuulab.com or any *.zuulab.com subdomain -> '.zuulab.com'
 * - In development (localhost / 127.0.0.1) -> undefined (browser binds cookie to current host)
 */
export function getSessionCookieDomain(host?: string | null): string | undefined {
  if (!host) return undefined
  const cleanHost = host.split(':')[0].toLowerCase()
  if (cleanHost === 'zuulab.com' || cleanHost.endsWith('.zuulab.com')) {
    return '.zuulab.com'
  }
  return undefined
}

/**
 * Extracts the zuulab_session cookie value from the HTTP Request.
 */
export function extractSessionCookie(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie')
  if (!cookieHeader) return null
  const cookies = cookieHeader.split(';').map((c) => c.trim())
  for (const c of cookies) {
    if (c.startsWith(`${SESSION_COOKIE_NAME}=`)) {
      return decodeURIComponent(c.slice(`${SESSION_COOKIE_NAME}=`.length))
    }
  }
  return null
}
