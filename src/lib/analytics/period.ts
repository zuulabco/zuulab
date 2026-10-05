/**
 * The date span the Analizler page reports on: a preset (today, last 7 / 28 / 90
 * days) or a custom start–end chosen by the admin. Days are Turkish calendar days
 * (Europe/Istanbul), inclusive at both ends, as YYYY-MM-DD.
 *
 * Each period is compared with the one just before it, of the same length
 * (today → yesterday; 1–10 March → 19–28 February).
 */

export type AnalyticsPreset = 'today' | '7' | '28' | '90' | 'custom'

export interface AnalyticsPeriod {
  preset: AnalyticsPreset
  start: string
  end: string
  /** Number of days, both ends included */
  days: number
  previous: { start: string; end: string }
}

/** GA4 has no data before this day */
export const EARLIEST_DAY = '2015-08-14'
const DAY_MS = 86_400_000
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/** Today's date in Türkiye, YYYY-MM-DD */
export function todayInTurkey(now = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(now)
}

/** Day arithmetic on YYYY-MM-DD strings (calendar days, no time zone involved) */
export function shiftDay(day: string, by: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + by * DAY_MS).toISOString().slice(0, 10)
}

/** Days from `start` to `end`, both included */
export function spanDays(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS) + 1
}

function isRealDay(day: string): boolean {
  return ISO_DAY.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) && shiftDay(day, 0) === day
}

function build(preset: AnalyticsPreset, start: string, end: string): AnalyticsPeriod {
  const days = spanDays(start, end)
  return { preset, start, end, days, previous: { start: shiftDay(start, -days), end: shiftDay(start, -1) } }
}

export class PeriodError extends Error {}

/**
 * The period asked for in a query string: `range=today|7|28|90`, or
 * `start=YYYY-MM-DD&end=YYYY-MM-DD`. Nothing asked → last 28 days.
 * Throws PeriodError for a custom span that is not a real, past span.
 */
export function resolvePeriod(params: URLSearchParams, now = new Date()): AnalyticsPeriod {
  const today = todayInTurkey(now)
  const start = params.get('start')
  const end = params.get('end')

  if (start || end) {
    if (!start || !end || !isRealDay(start) || !isRealDay(end)) {
      throw new PeriodError('Geçerli bir başlangıç ve bitiş tarihi seçin.')
    }
    if (start > end) throw new PeriodError('Başlangıç tarihi bitiş tarihinden sonra olamaz.')
    if (end > today) throw new PeriodError('Bitiş tarihi bugünden sonra olamaz.')
    if (start < EARLIEST_DAY) throw new PeriodError('Bu tarihten önceki veriler Google Analytics’te yok.')
    return build('custom', start, end)
  }

  const range = params.get('range')
  if (range === 'today') return build('today', today, today)
  const n = range === '7' || range === '90' ? Number(range) : 28
  return build(String(n) as AnalyticsPreset, shiftDay(today, -(n - 1)), today)
}
