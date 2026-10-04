import 'server-only'
import crypto from 'crypto'
import { isSignInFromEarlierDay, secondsUntilTrMidnight } from '@/lib/auth/daily-session'

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
/** Longest a session can live; sign-ins actually end at the next midnight (sessionMaxAge) */
export const SESSION_MAX_AGE = 24 * 60 * 60

/** Seconds until the next 00:00 in Türkiye, when every sign-in ends */
export function sessionMaxAge(): number {
  return secondsUntilTrMidnight()
}

/**
 * Resolves session secret from environment variables.
 * Falls back to a deterministic hash of FIREBASE_PRIVATE_KEY if explicit secret is not set,
 * so existing sessions keep working until AUTH_SESSION_SECRET is configured. A publicly
 * known constant is only acceptable outside production.
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
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_CONFIGURATION_ERROR: AUTH_SESSION_SECRET must be configured in production.')
  }
  return 'zuulab-dev-session-secret'
}

/**
 * Creates a cryptographically signed HMAC-SHA256 session token.
 */
export function createSessionToken(
  data: Omit<SessionPayload, 'iat' | 'exp'>,
  expiresInSeconds = sessionMaxAge()
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
    // Sessions end at midnight: one issued on an earlier day is no longer valid
    if (payload.iat && isSignInFromEarlierDay(payload.iat * 1000)) {
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
  return readCookie(request, SESSION_COOKIE_NAME)
}

function readCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get('cookie')
  if (!cookieHeader) return null
  const cookies = cookieHeader.split(';').map((c) => c.trim())
  for (const c of cookies) {
    if (c.startsWith(`${name}=`)) {
      return decodeURIComponent(c.slice(`${name}=`.length))
    }
  }
  return null
}

// ─────────────────────────────────────────────────────────────
// Order access (guest checkout)
// ─────────────────────────────────────────────────────────────

export const ORDER_ACCESS_COOKIE_NAME = 'zuulab_order_access'
export const ORDER_ACCESS_MAX_AGE = 24 * 60 * 60 // 1 day in seconds

/**
 * Proves that the browser holding it created the order, so a guest can retry
 * payment without an account while knowing the order number alone is not enough.
 * Signed under a separate domain tag so it can never be replayed as a session token.
 */
export function createOrderAccessToken(orderNumber: string): string {
  const exp = Math.floor(Date.now() / 1000) + ORDER_ACCESS_MAX_AGE
  const encoded = Buffer.from(JSON.stringify({ orderNumber, exp })).toString('base64url')
  return `${encoded}.${signOrderAccess(encoded)}`
}

export function hasOrderAccess(request: Request, orderNumber: string): boolean {
  const token = readCookie(request, ORDER_ACCESS_COOKIE_NAME)
  if (!token) return false
  const [encoded, signature] = token.split('.')
  if (!encoded || !signature) return false

  const providedBuf = Buffer.from(signature)
  const expectedBuf = Buffer.from(signOrderAccess(encoded))
  if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return false
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
    return payload.orderNumber === orderNumber && payload.exp >= Math.floor(Date.now() / 1000)
  } catch {
    return false
  }
}

function signOrderAccess(encoded: string): string {
  return crypto
    .createHmac('sha256', getSessionSecret())
    .update(`order-access:${encoded}`)
    .digest('base64url')
}
