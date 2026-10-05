import { describe, expect, it } from 'vitest'
import { PeriodError, resolvePeriod, todayInTurkey } from '@/lib/analytics/period'

// 5 Oct 2026, 22:30 UTC = 6 Oct 01:30 in Türkiye
const NOW = new Date('2026-10-05T22:30:00Z')
const ask = (query: string) => resolvePeriod(new URLSearchParams(query), NOW)

describe('analytics period', () => {
  it('uses the Turkish calendar day', () => {
    expect(todayInTurkey(NOW)).toBe('2026-10-06')
  })

  it('today compares with yesterday', () => {
    expect(ask('range=today')).toEqual({
      preset: 'today',
      start: '2026-10-06',
      end: '2026-10-06',
      days: 1,
      previous: { start: '2026-10-05', end: '2026-10-05' },
    })
  })

  it('presets end today; unknown or missing means 28 days', () => {
    expect(ask('range=7')).toMatchObject({ start: '2026-09-30', end: '2026-10-06', days: 7 })
    expect(ask('range=7').previous).toEqual({ start: '2026-09-23', end: '2026-09-29' })
    expect(ask('')).toMatchObject({ preset: '28', days: 28 })
    expect(ask('range=365')).toMatchObject({ preset: '28' })
  })

  it('custom span includes both ends and compares with the span before it', () => {
    expect(ask('start=2026-03-01&end=2026-03-10')).toEqual({
      preset: 'custom',
      start: '2026-03-01',
      end: '2026-03-10',
      days: 10,
      previous: { start: '2026-02-19', end: '2026-02-28' },
    })
  })

  it.each([
    'start=2026-03-10&end=2026-03-01',
    'start=2026-02-30&end=2026-03-01',
    'start=2026-10-01&end=2026-10-07',
    'start=2026-10-01',
    'start=yesterday&end=today',
    'start=2010-01-01&end=2010-02-01',
  ])('refuses %s', (query) => {
    expect(() => ask(query)).toThrow(PeriodError)
  })
})
