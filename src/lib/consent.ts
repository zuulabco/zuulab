/**
 * Cookie consent, browser side. "necessary" = only what the site needs to work
 * (sign-in session, cart, favourites); "all" = also analytics/marketing tools, if
 * any are added later. Such tools must check `hasConsent('all')` before loading.
 *
 * Stored in localStorage and mirrored to a cookie so server code could read it.
 */
export type ConsentLevel = 'all' | 'necessary'

const KEY = 'zuulab_cookie_consent'
export const CONSENT_EVENT = 'zuulab:consent'
const ONE_YEAR = 60 * 60 * 24 * 365

export function getConsent(): ConsentLevel | null {
  if (typeof window === 'undefined') return null
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'all' || v === 'necessary') return v
  } catch {
    // storage blocked: fall back to the cookie
  }
  const m = document.cookie.match(new RegExp(`(?:^|; )${KEY}=(all|necessary)`))
  return (m?.[1] as ConsentLevel | undefined) ?? null
}

export function setConsent(level: ConsentLevel): void {
  try {
    localStorage.setItem(KEY, level)
  } catch {
    // private mode: the cookie below still remembers it
  }
  document.cookie = `${KEY}=${level}; Max-Age=${ONE_YEAR}; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: level }))
}

export function hasConsent(level: ConsentLevel): boolean {
  const c = getConsent()
  return level === 'necessary' ? c !== null : c === 'all'
}
