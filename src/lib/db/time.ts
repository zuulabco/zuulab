import { Temporal as TemporalPolyfill } from '@js-temporal/polyfill'

/**
 * The Prisma 8 runtime maps `timestamp` columns to Temporal.PlainDateTime. All
 * application timestamps are stored as UTC wall-clock values.
 *
 * Uses the same Temporal the runtime uses (native, or the polyfill `src/prisma/db.ts`
 * installs on globalThis) so the codec recognises the instances we pass in.
 */
function temporal(): typeof TemporalPolyfill {
  return ((globalThis as { Temporal?: typeof TemporalPolyfill }).Temporal ?? TemporalPolyfill)
}

export function toDbTimestamp(date: Date = new Date()): TemporalPolyfill.PlainDateTime {
  return temporal()
    .Instant.fromEpochMilliseconds(date.getTime())
    .toZonedDateTimeISO('UTC')
    .toPlainDateTime()
}

export function fromDbTimestamp(value: unknown): Date | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value
  const text = String(value)
  if (!text) return null
  // PlainDateTime#toString has no offset; interpret it as UTC.
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(text) ? text : `${text}Z`)
}

export function dbTimestampToIso(value: unknown): string | null {
  return fromDbTimestamp(value)?.toISOString() ?? null
}
