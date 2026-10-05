import 'server-only'
import { getClientIp } from '@/lib/config/maintenance'
import type { EventClient } from './events'

/**
 * The browser identifiers a request carries that Meta's Conversions API uses to match an
 * event to an ad click: the IP address, the user agent and the _fbp / _fbc cookies the
 * Meta Pixel sets on our own domain. Call only for a visitor who consented.
 */

const COOKIE_RE = /^fb\.\d\.\d{10,13}\.[A-Za-z0-9_-]{1,200}$/

function cookie(header: string | null, name: string): string | undefined {
  const m = header?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
  if (!m) return undefined
  let v = m[1]
  try {
    v = decodeURIComponent(v)
  } catch {
    // keep the raw value
  }
  return COOKIE_RE.test(v) ? v : undefined
}

export function readClientContext(request: Request): EventClient {
  const headers = new Headers(request.headers)
  const ip = getClientIp(headers)
  const cookies = headers.get('cookie')
  const out: EventClient = {
    ip: ip && ip !== '127.0.0.1' ? ip : undefined,
    userAgent: headers.get('user-agent')?.slice(0, 400) || undefined,
    fbp: cookie(cookies, '_fbp'),
    fbc: cookie(cookies, '_fbc'),
  }
  for (const key of Object.keys(out) as Array<keyof EventClient>) if (out[key] === undefined) delete out[key]
  return out
}

/** The cookie-banner choice, from the cookie lib/consent.ts mirrors for server code */
export function readConsentCookie(request: Request): 'all' | 'necessary' | null {
  const m = request.headers.get('cookie')?.match(/(?:^|;\s*)zuulab_cookie_consent=(all|necessary)/)
  return (m?.[1] as 'all' | 'necessary' | undefined) ?? null
}
