/**
 * Sign-ins last until the next midnight in Türkiye (UTC+3, no daylight saving): at
 * 00:00 everyone is signed out and logs in again. Shared by the server (session
 * cookie and Firebase token checks) and the browser (the logout timer).
 */
const DAY_MS = 24 * 60 * 60 * 1000
const TR_OFFSET_MS = 3 * 60 * 60 * 1000

/** The most recent 00:00 in Türkiye, as epoch milliseconds */
export function lastTrMidnight(now = Date.now()): number {
  return Math.floor((now + TR_OFFSET_MS) / DAY_MS) * DAY_MS - TR_OFFSET_MS
}

/** The coming 00:00 in Türkiye, as epoch milliseconds */
export function nextTrMidnight(now = Date.now()): number {
  return lastTrMidnight(now) + DAY_MS
}

/** Seconds a session started now may live (until the coming midnight) */
export function secondsUntilTrMidnight(now = Date.now()): number {
  return Math.max(60, Math.floor((nextTrMidnight(now) - now) / 1000))
}

/** True when a sign-in made at `signedInAtMs` happened before today's midnight */
export function isSignInFromEarlierDay(signedInAtMs: number, now = Date.now()): boolean {
  return signedInAtMs < lastTrMidnight(now)
}
