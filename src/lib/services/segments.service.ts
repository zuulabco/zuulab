import 'server-only'
import { db } from '@/prisma/db'
import {
  SEGMENT_BY_KEY,
  missingSetting,
  resolveSettings,
  type ResolvedSettings,
  type SegmentKey,
  type SegmentSettings,
} from '@/lib/segments/definitions'

/**
 * Counts and lists the segments defined in lib/segments/definitions.ts.
 *
 * Customers are people who ordered on the storefront (channel DIRECT, a sold status); their
 * e-mail comes from the account. "Reachable" means they hold an ACTIVE commercial e-mail
 * permission, the only people a marketing mail may go to. Visitors are counted from the
 * consented event log and are never named. Timestamps are UTC wall-clock, like the rest of the database.
 */

type Rec = Record<string, unknown>
const run = <T = Rec>(query: unknown) => db.runtime().query(query as never) as unknown as Promise<T[]>
const int = (v: unknown) => Number(v ?? 0)
const num = (v: unknown) => Number(v ?? 0)

export interface SegmentMember {
  email: string
  name: string
  orders: number
  spent: number
  lastOrderAt: string | null
  /** Holds an ACTIVE commercial e-mail permission */
  reachable: boolean
}

export interface SegmentResult {
  key: SegmentKey
  kind: 'customers' | 'visitors'
  settings: ResolvedSettings
  /** Set when the segment still needs a choice (a product, a collection) */
  needs: string | null
  total: number
  /** Customers with an ACTIVE e-mail permission (customers only) */
  reachable: number
  /** Up to `limit` people, most recent first (customers only) */
  members: SegmentMember[]
}

const SAMPLE_LIMIT = 25

async function customerSegment(key: SegmentKey, s: ResolvedSettings, limit: number): Promise<{ total: number; reachable: number; members: SegmentMember[] }> {
  const rows = await run<{ email: string; name: string; orders: number; spent: string; last_at: string | null; reachable: boolean; total: number; reachable_total: number }>(
    db.raw.sql`
      WITH sold AS (
        SELECT o.user_id, COUNT(*)::int AS n, COALESCE(SUM(o.total), 0) AS spent, MAX(o.created_at) AS last_at
        FROM orders o
        WHERE o.channel = 'DIRECT' AND o.status IN ('PAYMENT_RECEIVED', 'CONFIRMED', 'PREPARING', 'IN_PRODUCTION', 'PACKING', 'SHIPPED', 'DELIVERED')
        GROUP BY o.user_id
      ),
      picked AS (
        SELECT u.email, COALESCE(NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''), u.name, '') AS name,
               sold.n, sold.spent, sold.last_at,
               EXISTS (SELECT 1 FROM email_consents c WHERE LOWER(c.email) = LOWER(u.email) AND c.status = 'ACTIVE') AS reachable
        FROM sold JOIN users u ON u.id = sold.user_id
        WHERE CASE ${key}::text
          WHEN 'first_time_buyers' THEN sold.n = 1
          WHEN 'repeat_buyers' THEN sold.n >= 2
          WHEN 'high_spenders' THEN sold.spent >= ${s.minSpend}::numeric
          WHEN 'recent_buyers' THEN sold.last_at >= (now() AT TIME ZONE 'utc') - (${s.days}::int * INTERVAL '1 day')
          WHEN 'inactive_customers' THEN sold.last_at < (now() AT TIME ZONE 'utc') - (${s.days}::int * INTERVAL '1 day')
          WHEN 'product_buyers' THEN EXISTS (
            SELECT 1 FROM order_items oi JOIN orders o2 ON o2.id = oi.order_id
            WHERE oi.product_id = ${s.productId} AND o2.user_id = sold.user_id AND o2.channel = 'DIRECT'
              AND o2.status IN ('PAYMENT_RECEIVED', 'CONFIRMED', 'PREPARING', 'IN_PRODUCTION', 'PACKING', 'SHIPPED', 'DELIVERED'))
          ELSE FALSE END
      )
      SELECT email, name, n AS orders, spent::text AS spent, to_char(last_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_at, reachable,
             COUNT(*) OVER ()::int AS total, (COUNT(*) FILTER (WHERE reachable) OVER ())::int AS reachable_total
      FROM picked ORDER BY last_at DESC LIMIT ${limit}::int`
      .returnsRow({
        email: 'pg/text@1', name: 'pg/text@1', orders: 'pg/int4@1', spent: 'pg/text@1', last_at: 'pg/text@1',
        reachable: 'pg/bool@1', total: 'pg/int4@1', reachable_total: 'pg/int4@1',
      } as never)
      .build()
  )
  return {
    total: rows.length ? int(rows[0].total) : 0,
    reachable: rows.length ? int(rows[0].reachable_total) : 0,
    members: rows.map((r) => ({
      email: r.email,
      name: r.name,
      orders: int(r.orders),
      spent: num(r.spent),
      lastOrderAt: r.last_at,
      reachable: Boolean(r.reachable),
    })),
  }
}

async function newsletterSegment(limit: number): Promise<{ total: number; reachable: number; members: SegmentMember[] }> {
  const rows = await run<{ email: string; at: string | null; reachable: boolean; total: number; reachable_total: number }>(
    db.raw.sql`
      WITH picked AS (
        SELECT n.email, n.confirmed_at,
               EXISTS (SELECT 1 FROM email_consents c WHERE LOWER(c.email) = LOWER(n.email) AND c.status = 'ACTIVE') AS reachable
        FROM newsletter_subscribers n WHERE n.status = 'ACTIVE'
      )
      SELECT email, to_char(confirmed_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS at, reachable,
             COUNT(*) OVER ()::int AS total, (COUNT(*) FILTER (WHERE reachable) OVER ())::int AS reachable_total
      FROM picked ORDER BY confirmed_at DESC NULLS LAST LIMIT ${limit}::int`
      .returnsRow({ email: 'pg/text@1', at: 'pg/text@1', reachable: 'pg/bool@1', total: 'pg/int4@1', reachable_total: 'pg/int4@1' } as never)
      .build()
  )
  return {
    total: rows.length ? int(rows[0].total) : 0,
    reachable: rows.length ? int(rows[0].reachable_total) : 0,
    members: rows.map((r) => ({ email: r.email, name: '', orders: 0, spent: 0, lastOrderAt: r.at, reachable: Boolean(r.reachable) })),
  }
}

async function visitorCount(key: SegmentKey, s: ResolvedSettings): Promise<number> {
  if (key === 'cart_abandoners') {
    const rows = await run<{ n: number }>(
      db.raw.sql`
        SELECT COUNT(DISTINCT e.anonymous_id)::int AS n FROM marketing_events e
        WHERE e.name = 'add_to_cart' AND e.anonymous_id IS NOT NULL
          AND e.occurred_at >= (now() AT TIME ZONE 'utc') - (${s.days}::int * INTERVAL '1 day')
          AND NOT EXISTS (SELECT 1 FROM marketing_events p WHERE p.anonymous_id = e.anonymous_id AND p.name = 'purchase' AND p.occurred_at >= e.occurred_at)`
        .returnsRow({ n: 'pg/int4@1' } as never)
        .build()
    )
    return int(rows[0]?.n)
  }
  if (key === 'collection_viewers') {
    const path = `/koleksiyon/${s.collectionSlug}`
    const rows = await run<{ n: number }>(
      db.raw.sql`
        SELECT COUNT(DISTINCT anonymous_id)::int AS n FROM marketing_events
        WHERE anonymous_id IS NOT NULL AND (page_path = ${path} OR page_path LIKE ${path + '/%'} OR page_path LIKE ${path + '?%'})
          AND occurred_at >= (now() AT TIME ZONE 'utc') - (${s.days}::int * INTERVAL '1 day')`
        .returnsRow({ n: 'pg/int4@1' } as never)
        .build()
    )
    return int(rows[0]?.n)
  }
  // meta_ad_visitors
  const rows = await run<{ n: number }>(
    db.raw.sql`
      SELECT COUNT(DISTINCT anonymous_id)::int AS n FROM marketing_events
      WHERE anonymous_id IS NOT NULL AND LOWER(utm_source) IN ('facebook', 'fb', 'instagram', 'ig', 'meta')
        AND occurred_at >= (now() AT TIME ZONE 'utc') - (${s.days}::int * INTERVAL '1 day')`
      .returnsRow({ n: 'pg/int4@1' } as never)
      .build()
  )
  return int(rows[0]?.n)
}

/** One segment with its settings applied. `limit` caps the listed people (at least 1, so the totals come back too). */
export async function getSegment(key: SegmentKey, input: SegmentSettings = {}, limit = SAMPLE_LIMIT): Promise<SegmentResult> {
  const def = SEGMENT_BY_KEY[key]
  const settings = resolveSettings(key, input)
  const base = { key, kind: def.kind, settings, needs: missingSetting(key, settings) }
  if (base.needs) return { ...base, total: 0, reachable: 0, members: [] }
  if (def.kind === 'visitors') return { ...base, total: await visitorCount(key, settings), reachable: 0, members: [] }
  const rows = Math.max(1, limit)
  const found = key === 'newsletter_subscribers' ? await newsletterSegment(rows) : await customerSegment(key, settings, rows)
  return { ...base, ...found }
}

/** Counts of every segment that needs no choice, for the overview. */
export async function getSegmentOverview(): Promise<SegmentResult[]> {
  const keys = (Object.keys(SEGMENT_BY_KEY) as SegmentKey[]).filter((k) => !missingSetting(k, resolveSettings(k)))
  return Promise.all(keys.map((k) => getSegment(k, {}, 1)))
}

/** The e-mail addresses of a customer segment that may be mailed (ACTIVE permission). Used for exports and, later, campaigns. */
export async function reachableEmails(key: SegmentKey, input: SegmentSettings = {}): Promise<string[]> {
  if (SEGMENT_BY_KEY[key].kind !== 'customers') return []
  const result = await getSegment(key, input, 100000)
  return result.members.filter((m) => m.reachable).map((m) => m.email)
}
