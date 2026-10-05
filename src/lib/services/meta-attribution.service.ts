import 'server-only'
import { db } from '@/prisma/db'
import { periodBounds } from '@/lib/analytics/internal'
import { compareSales, joinCampaigns, type AttributionResult, type EventTouchRow, type OrderTouchRow } from '@/lib/meta-ads/attribution-report'
import { getInsightsReport } from '@/lib/services/meta-ads.service'

/**
 * Meta's ad numbers beside the shop's own measurement (Faz 13). Meta's side comes from the Marketing API
 * (spend and the purchases it credits); the shop's side from its own event log (visits, carts, checkouts)
 * and from the orders table (sales). The matching rules are in lib/meta-ads/attribution-report.ts.
 *
 * Only visits and orders that came from Meta count as Meta's: utm_source facebook/instagram/meta, or an
 * fbclid on the order (Meta adds it to every ad click, even to ads without our tracking tags).
 * Timestamps are UTC wall-clock; periods are Turkish calendar days.
 */

type Rec = Record<string, unknown>
const run = <T = Rec>(query: unknown) => db.runtime().query(query as never) as unknown as Promise<T[]>
const int = (v: unknown) => Number(v ?? 0)

export interface AttributionReport {
  generatedAt: string
  currency: string
  result: AttributionResult
  /** All storefront sales in the period, whatever their source */
  shop: { orders: number; revenue: number }
  /** Meta's claimed sales vs the shop's count of Meta-sourced sales */
  comparison: ReturnType<typeof compareSales>
}

async function metaEvents(from: string, to: string): Promise<EventTouchRow[]> {
  const rows = await run<{ campaign: string; visitors: number; carts: number; checkouts: number }>(
    db.raw.sql`
      SELECT LOWER(COALESCE(utm_campaign, '')) AS campaign,
        COUNT(DISTINCT anonymous_id)::int AS visitors,
        COUNT(DISTINCT anonymous_id) FILTER (WHERE name = 'add_to_cart')::int AS carts,
        COUNT(DISTINCT anonymous_id) FILTER (WHERE name = 'begin_checkout')::int AS checkouts
      FROM marketing_events
      WHERE anonymous_id IS NOT NULL AND LOWER(COALESCE(utm_source, '')) IN ('facebook', 'fb', 'instagram', 'ig', 'meta')
        AND occurred_at >= ${from}::timestamp AND occurred_at < ${to}::timestamp
      GROUP BY 1`
      .returnsRow({ campaign: 'pg/text@1', visitors: 'pg/int4@1', carts: 'pg/int4@1', checkouts: 'pg/int4@1' } as never)
      .build()
  )
  return rows.map((r) => ({ campaign: r.campaign, visitors: int(r.visitors), cartAdders: int(r.carts), checkoutStarters: int(r.checkouts) }))
}

async function metaOrders(from: string, to: string): Promise<OrderTouchRow[]> {
  const rows = await run<{ campaign: string; orders: number; revenue: string }>(
    db.raw.sql`
      SELECT LOWER(COALESCE(attribution -> 'last' ->> 'utmCampaign', '')) AS campaign,
        COUNT(*)::int AS orders, COALESCE(SUM(total), 0)::text AS revenue
      FROM orders
      WHERE channel = 'DIRECT' AND status IN ('PAYMENT_RECEIVED', 'CONFIRMED', 'PREPARING', 'IN_PRODUCTION', 'PACKING', 'SHIPPED', 'DELIVERED')
        AND created_at >= ${from}::timestamp AND created_at < ${to}::timestamp
        AND (LOWER(COALESCE(attribution -> 'last' ->> 'utmSource', '')) IN ('facebook', 'fb', 'instagram', 'ig', 'meta')
             OR COALESCE(attribution -> 'last' ->> 'fbclid', '') <> '')
      GROUP BY 1`
      .returnsRow({ campaign: 'pg/text@1', orders: 'pg/int4@1', revenue: 'pg/text@1' } as never)
      .build()
  )
  return rows.map((r) => ({ campaign: r.campaign, orders: int(r.orders), revenue: Number(r.revenue) }))
}

async function shopTotals(from: string, to: string): Promise<{ orders: number; revenue: number }> {
  const [row] = await run<{ orders: number; revenue: string }>(
    db.raw.sql`
      SELECT COUNT(*)::int AS orders, COALESCE(SUM(total), 0)::text AS revenue FROM orders
      WHERE channel = 'DIRECT' AND status IN ('PAYMENT_RECEIVED', 'CONFIRMED', 'PREPARING', 'IN_PRODUCTION', 'PACKING', 'SHIPPED', 'DELIVERED')
        AND created_at >= ${from}::timestamp AND created_at < ${to}::timestamp`
      .returnsRow({ orders: 'pg/int4@1', revenue: 'pg/text@1' } as never)
      .build()
  )
  return { orders: int(row?.orders), revenue: Number(row?.revenue ?? 0) }
}

export async function getAttributionReport(
  period: { start: string; end: string; previous: { start: string; end: string } },
  fresh = false
): Promise<AttributionReport> {
  const { from, to } = periodBounds(period)
  const [meta, events, orders, shop] = await Promise.all([
    getInsightsReport(period, 'campaign', fresh),
    metaEvents(from, to),
    metaOrders(from, to),
    shopTotals(from, to),
  ])
  const result = joinCampaigns(meta.rows, events, orders)
  return {
    generatedAt: new Date().toISOString(),
    currency: meta.currency,
    result,
    shop,
    comparison: compareSales(result.totals.metaValue, result.totals.revenue),
  }
}
