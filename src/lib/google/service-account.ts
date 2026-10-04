import 'server-only'
import { createSign } from 'node:crypto'
import { cleanEnvValue, sanitizePrivateKey } from '@/lib/firebase-admin'

/**
 * OAuth access tokens for Google APIs (Analytics Data API, Search Console API)
 * from a service account, signed locally with node:crypto: no Google SDK needed.
 *
 * Credentials: GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
 * or else the Firebase Admin service account the site already has. That account's
 * e-mail must be added as a user in Google Analytics and Search Console.
 */

export const serviceAccountEmail =
  cleanEnvValue(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) ||
  cleanEnvValue(process.env.FIREBASE_ADMIN_CLIENT_EMAIL) ||
  cleanEnvValue(process.env.FIREBASE_CLIENT_EMAIL) ||
  null

const privateKey = sanitizePrivateKey(
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY
)

export const isServiceAccountConfigured = Boolean(serviceAccountEmail && privateKey?.includes('PRIVATE KEY'))

const b64url = (input: string | Buffer) => Buffer.from(input).toString('base64url')

const tokens = new Map<string, { token: string; expiresAt: number }>()

/** A bearer token for the given scopes, cached until shortly before it expires */
export async function getGoogleAccessToken(scopes: string[]): Promise<string> {
  if (!isServiceAccountConfigured || !serviceAccountEmail || !privateKey) {
    throw new GoogleApiError('Google servis hesabı tanımlı değil.', 'not_configured')
  }
  const key = scopes.slice().sort().join(' ')
  const cached = tokens.get(key)
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token

  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(
    JSON.stringify({ iss: serviceAccountEmail, scope: key, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })
  )
  const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(privateKey)
  const assertion = `${header}.${claims}.${b64url(signature)}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    cache: 'no-store',
  })
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string }
  if (!res.ok || !data.access_token) {
    throw new GoogleApiError(`Google oturumu açılamadı: ${data.error_description || res.status}`, 'auth_failed')
  }
  tokens.set(key, { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 })
  return data.access_token
}

export type GoogleApiErrorCode = 'not_configured' | 'auth_failed' | 'api_disabled' | 'no_access' | 'bad_request' | 'failed'

export class GoogleApiError extends Error {
  constructor(message: string, readonly code: GoogleApiErrorCode) {
    super(message)
  }
}

/** POST JSON to a Google API, turning its error replies into GoogleApiError codes */
export async function googleApiPost<T>(url: string, scopes: string[], body: unknown): Promise<T> {
  const token = await getGoogleAccessToken(scopes)
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (res.ok) return (await res.json()) as T
  const err = (await res.json().catch(() => ({}))) as { error?: { message?: string; status?: string } }
  const message = err.error?.message || `HTTP ${res.status}`
  if (/has not been used|is disabled|SERVICE_DISABLED/i.test(message)) throw new GoogleApiError(message, 'api_disabled')
  if (res.status === 403 || res.status === 401) throw new GoogleApiError(message, 'no_access')
  if (res.status === 400 || res.status === 404) throw new GoogleApiError(message, 'bad_request')
  throw new GoogleApiError(message, 'failed')
}
