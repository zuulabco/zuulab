import { describe, expect, it } from 'vitest'
import { isSignInFromEarlierDay, lastTrMidnight, nextTrMidnight, secondsUntilTrMidnight } from '@/lib/auth/daily-session'

// Türkiye is UTC+3 all year: 00:00 there is 21:00 UTC the day before
describe('daily session (midnight in Türkiye)', () => {
  it('finds the last and next midnight', () => {
    const now = Date.parse('2026-10-05T10:00:00Z') // 13:00 in Türkiye
    expect(new Date(lastTrMidnight(now)).toISOString()).toBe('2026-10-04T21:00:00.000Z')
    expect(new Date(nextTrMidnight(now)).toISOString()).toBe('2026-10-05T21:00:00.000Z')
  })

  it('treats 22:30 UTC as already the next day in Türkiye', () => {
    const now = Date.parse('2026-10-05T22:30:00Z') // 01:30 on 6 October in Türkiye
    expect(new Date(lastTrMidnight(now)).toISOString()).toBe('2026-10-05T21:00:00.000Z')
  })

  it('ends a sign-in from before midnight, keeps one from today', () => {
    const now = Date.parse('2026-10-05T21:00:30Z') // 00:00:30 in Türkiye
    expect(isSignInFromEarlierDay(Date.parse('2026-10-05T20:59:59Z'), now)).toBe(true)
    expect(isSignInFromEarlierDay(Date.parse('2026-10-05T21:00:10Z'), now)).toBe(false)
  })

  it('lets a session live until midnight', () => {
    const now = Date.parse('2026-10-05T20:00:00Z') // 23:00 in Türkiye
    expect(secondsUntilTrMidnight(now)).toBe(3600)
  })
})
