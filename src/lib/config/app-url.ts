import 'server-only'

const FALLBACK_ORIGIN = 'https://www.zuulab.com'

function isUsableOrigin(value: string | undefined): value is string {
  if (!value) return false
  try {
    const url = new URL(value)
    if (process.env.NODE_ENV !== 'production') return true
    return url.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)
  } catch {
    return false
  }
}

/**
 * Public origin for URLs the customer's browser is sent back to (PayTR
 * merchant_ok_url / merchant_fail_url).
 *
 * The origin the customer is actually on comes first: the order-access cookie set at
 * checkout is bound to that host (zuulab.com vs www.zuulab.com), so returning anywhere
 * else would lose it. NEXT_PUBLIC_APP_URL is used when there is no request; a
 * localhost value is never used in production.
 */
export function getPublicOrigin(request?: Request): string {
  if (request) {
    const headers = request.headers
    const host = headers.get('x-forwarded-host') || headers.get('host')
    const proto = headers.get('x-forwarded-proto') || (process.env.NODE_ENV === 'production' ? 'https' : 'http')
    const fromRequest = host ? `${proto.split(',')[0].trim()}://${host.split(',')[0].trim()}` : undefined
    if (isUsableOrigin(fromRequest)) return new URL(fromRequest).origin
  }

  const configured = process.env.NEXT_PUBLIC_APP_URL
  if (isUsableOrigin(configured)) return new URL(configured).origin

  return process.env.NODE_ENV === 'production' ? FALLBACK_ORIGIN : 'http://localhost:3000'
}
