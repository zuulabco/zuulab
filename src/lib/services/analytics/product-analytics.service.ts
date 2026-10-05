import 'server-only'
import { db } from '@/prisma/db'
import type { AnalyticsPeriod } from '@/lib/analytics/period'
import { periodBounds } from '@/lib/analytics/internal'
import {
  buildProductRows,
  opportunities,
  rankings,
  type EventCount,
  type ProductOpportunities,
  type ProductRow,
  type Rankings,
  type SaleRow,
  type SourceSale,
} from '@/lib/analytics/product-insights'
import { getInternalMetrics } from './internal-analytics.service'

/**
 * Product analytics for the admin: per product, views → carts → checkouts → sales, revenue and
 * average price, where its sales came from, plus the products that deserve attention. The
 * rules are in lib/analytics/product-insights.ts; this file runs the queries. Sales are
 * storefront orders in a sold status (same set as the rest of the internal analytics).
 */

type Rec = Record<string, unknown>
const run = <T = Rec>(query: unknown) => db.runtime().query(query as never) as unknown as Promise<T[]>
const int = (v: unknown) => Number(v ?? 0)

export interface ProductMetrics {
  period: { start: string; end: string }
  products: ProductRow[]
  rankings: Rankings
  opportunities: ProductOpportunities
  /** Whole-shop conversion the products are judged against */
  shopConversion: number | null
}

export async function getProductMetrics(range: { start: string; end: string }): Promise<ProductMetrics> {
  const { from, to } = periodBounds(range)

  const [events, sales, sources, names, shop] = await Promise.all([
    run<Rec>(
      db.raw.sql`SELECT product_id, name, COUNT(*)::int AS events, COUNT(DISTINCT anonymous_id)::int AS visitors
        FROM marketing_events
        WHERE occurred_at >= ${from}::timestamp AND occurred_at < ${to}::timestamp
          AND product_id IS NOT NULL AND name IN ('product_view', 'add_to_cart', 'begin_checkout_item')
        GROUP BY product_id, name`
        .returnsRow({ product_id: 'pg/text@1', name: 'pg/text@1', events: 'pg/int4@1', visitors: 'pg/int4@1' } as never)
        .build()
    ),
    run<Rec>(
      db.raw.sql`SELECT oi.product_id, MAX(oi.product_name) AS product_name, SUM(oi.quantity)::int AS units,
          SUM(oi.total)::text AS revenue, COUNT(DISTINCT o.id)::int AS orders,
          COUNT(DISTINCT o.anonymous_id) FILTER (WHERE o.marketing_consent = 'all')::int AS buyers
        FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.channel = 'DIRECT' AND o.status IN ('PAYMENT_RECEIVED', 'CONFIRMED', 'PREPARING', 'IN_PRODUCTION', 'PACKING', 'SHIPPED', 'DELIVERED')
          AND o.created_at >= ${from}::timestamp AND o.created_at < ${to}::timestamp
        GROUP BY oi.product_id`
        .returnsRow({ product_id: 'pg/text@1', product_name: 'pg/text@1', units: 'pg/int4@1', revenue: 'pg/text@1', orders: 'pg/int4@1', buyers: 'pg/int4@1' } as never)
        .build()
    ),
    run<Rec>(
      db.raw.sql`SELECT oi.product_id,
          COALESCE(o.attribution->'last'->>'utmSource', '') AS source,
          COALESCE(o.attribution->'last'->>'utmMedium', '') AS medium,
          COALESCE(o.attribution->'last'->>'utmCampaign', '') AS campaign,
          COUNT(DISTINCT o.id)::int AS orders, SUM(oi.quantity)::int AS units, SUM(oi.total)::text AS revenue
        FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.channel = 'DIRECT' AND o.status IN ('PAYMENT_RECEIVED', 'CONFIRMED', 'PREPARING', 'IN_PRODUCTION', 'PACKING', 'SHIPPED', 'DELIVERED')
          AND o.created_at >= ${from}::timestamp AND o.created_at < ${to}::timestamp
          AND o.attribution->'last'->>'utmSource' IS NOT NULL
        GROUP BY 1, 2, 3, 4`
        .returnsRow({ product_id: 'pg/text@1', source: 'pg/text@1', medium: 'pg/text@1', campaign: 'pg/text@1', orders: 'pg/int4@1', units: 'pg/int4@1', revenue: 'pg/text@1' } as never)
        .build()
    ),
    db.orm.public.Product.select('id', 'name').all(),
    getInternalMetrics(range),
  ])

  const rows = buildProductRows({
    events: events.map((e): EventCount => ({ productId: String(e.product_id), name: String(e.name), events: int(e.events), visitors: int(e.visitors) })),
    sales: sales.map((s): SaleRow => ({
      productId: String(s.product_id),
      productName: String(s.product_name ?? ''),
      units: int(s.units),
      revenue: Number(s.revenue ?? 0),
      orders: int(s.orders),
      buyers: int(s.buyers),
    })),
    sources: sources.map((s): SourceSale => ({
      productId: String(s.product_id),
      source: String(s.source),
      medium: String(s.medium),
      campaign: String(s.campaign),
      orders: int(s.orders),
      units: int(s.units),
      revenue: Number(s.revenue ?? 0),
    })),
    names: new Map(names.map((p) => [p.id, p.name])),
  })

  return {
    period: { start: range.start, end: range.end },
    products: rows,
    rankings: rankings(rows),
    opportunities: opportunities(rows, shop.conversionRate),
    shopConversion: shop.conversionRate,
  }
}

export interface ProductReport {
  generatedAt: string
  current: ProductMetrics
  previous: ProductMetrics
}

/** The period and the one before it, so each product's numbers can be shown with their change */
export async function getProductReport(period: AnalyticsPeriod): Promise<ProductReport> {
  const [current, previous] = await Promise.all([
    getProductMetrics({ start: period.start, end: period.end }),
    getProductMetrics(period.previous),
  ])
  return { generatedAt: new Date().toISOString(), current, previous }
}
