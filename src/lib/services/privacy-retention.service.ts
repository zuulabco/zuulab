import 'server-only'
import { db } from '@/prisma/db'

/**
 * Keeps marketing data only as long as the privacy notice says (KVKK data minimisation):
 *
 * - The browser identifiers stored with an order for Meta (IP address, browser, _fbp / _fbc) are
 *   only needed to send the purchase to Meta right after the sale, so they are removed after 30 days.
 *   The campaign parameters (utm_*) stay: they are not personal data and the reports need them.
 * - The shop's own visit records (marketing_events) are deleted after 14 months (425 days).
 *
 * Run by the daily job /api/cron/privacy-cleanup. The numbers here and in the cookie policy and the
 * KVKK notice must say the same thing.
 */

export const ORDER_BROWSER_IDS_DAYS = 30
export const EVENT_RETENTION_DAYS = 425

const wall = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ')
const daysBefore = (now: Date, days: number) => new Date(now.getTime() - days * 86_400_000)

export interface PurgeResult {
  /** Orders whose browser identifiers were removed */
  ordersCleaned: number
  /** Visit records deleted */
  eventsDeleted: number
}

export async function purgeExpiredPersonalData(now: Date = new Date()): Promise<PurgeResult> {
  const orders = await db.runtime().execute(
    db.raw.sql`UPDATE orders SET attribution = attribution - 'meta', updated_at = updated_at
               WHERE attribution IS NOT NULL AND attribution->'meta' IS NOT NULL
                 AND created_at < ${wall(daysBefore(now, ORDER_BROWSER_IDS_DAYS))}::timestamp`.affectedCount().build()
  )
  const events = await db.runtime().execute(
    db.raw.sql`DELETE FROM marketing_events WHERE occurred_at < ${wall(daysBefore(now, EVENT_RETENTION_DAYS))}::timestamp`.affectedCount().build()
  )
  return { ordersCleaned: orders.affectedRows, eventsDeleted: events.affectedRows }
}
