import 'server-only'
import { randomUUID } from 'node:crypto'
import { db } from '@/prisma/db'
import type { AnalyticsPeriod } from '@/lib/analytics/period'
import {
  abandonmentRate,
  averageOrderValue,
  buildFunnel,
  periodBounds,
  round2,
  share,
  type EventRow,
  type FunnelStep,
} from '@/lib/analytics/internal'

/**
 * ZUULAB's own analytics: stores the event log and answers the questions the shop owner
 * asks of it. The rules (what is stored, how counts become rates) are in
 * lib/analytics/internal.ts; this file only runs queries. Orders and revenue come from the
 * `orders` table, visitor behaviour from `marketing_events` (see the header there).
 *
 * A sale counts when the order is in one of the sold statuses below (the same set the
 * marketing purchase uses) and was placed on the storefront (channel DIRECT). Orders are
 * placed in the period by their creation time.
 */

type Rec = Record<string, unknown>
const run = <T = Rec>(query: unknown) => db.runtime().query(query as never) as unknown as Promise<T[]>
const int = (v: unknown) => Number(v ?? 0)

// ── Storing events ───────────────────────────────────────────────────

/** Stores one event; a repeated eventId is ignored. Throws only on a database error. */
export async function storeEvent(row: EventRow): Promise<void> {
  await run(
    db.raw.sql`
      INSERT INTO marketing_events
        (id, event_id, name, occurred_at, anonymous_id, session_id, product_id, value, page_path,
         utm_source, utm_medium, utm_campaign, utm_content)
      VALUES
        (${randomUUID()}, ${row.eventId}, ${row.name}, ${row.occurredAt.toISOString().slice(0, 19).replace('T', ' ')}::timestamp,
         NULLIF(${row.anonymousId ?? ''}, ''), NULLIF(${row.sessionId ?? ''}, ''), NULLIF(${row.productId ?? ''}, ''),
         NULLIF(${row.value === null ? '' : row.value.toFixed(2)}, '')::numeric,
         NULLIF(${row.pagePath ?? ''}, ''), NULLIF(${row.utmSource ?? ''}, ''), NULLIF(${row.utmMedium ?? ''}, ''),
         NULLIF(${row.utmCampaign ?? ''}, ''), NULLIF(${row.utmContent ?? ''}, ''))
      ON CONFLICT (event_id) DO NOTHING`
      .affectedCount()
      .build()
  )
}

// ── Reading ──────────────────────────────────────────────────────────

export interface ProductMetrics {
  productId: string
  name: string
  viewers: number
  cartAdders: number
  /** Consented visitors who bought it */
  buyers: number
  /** Units and revenue from all orders, tracked or not */
  units: number
  revenue: number
  /** buyers / viewers: both are consented visitors */
  conversionRate: number | null
}

export interface DayMetrics {
  day: string
  visitors: number
  orders: number
  revenue: number
}

export interface SourceMetrics {
  source: string
  medium: string
  campaign: string
  /** Visitors who arrived through it (consented, from events) */
  visitors: number
  /** Orders whose last campaign touch it was (from orders) */
  orders: number
  revenue: number
}

export interface InternalMetrics {
  period: { start: string; end: string }
  /** Consented visitors with at least one event */
  visitors: number
  sessions: number
  productViews: number
  addToCarts: number
  checkoutsStarted: number
  /** Orders and revenue: every storefront sale, tracked or not */
  orders: number
  revenue: number
  shipping: number
  averageOrderValue: number | null
  /** Consented buyers / consented visitors */
  conversionRate: number | null
  cartAbandonmentRate: number | null
  checkoutAbandonmentRate: number | null
  /** How many of the orders belong to a consented visitor: how far the visitor numbers can be trusted */
  trackedOrderShare: number | null
  funnel: FunnelStep[]
  products: ProductMetrics[]
  days: DayMetrics[]
  sources: SourceMetrics[]
}


export async function getInternalMetrics(range: { start: string; end: string }): Promise<InternalMetrics> {
  const { from, to } = periodBounds(range)
  const F = `${from}`
  const T = `${to}`

  const [totals, steps, orderTotals, abandonCart, abandonCheckout, productEvents, productOrders, eventDays, orderDays, eventSources, orderSources] =
    await Promise.all([
      run(
        db.raw.sql`SELECT COUNT(DISTINCT anonymous_id)::int AS visitors, COUNT(DISTINCT session_id)::int AS sessions
          FROM marketing_events WHERE occurred_at >= ${F}::timestamp AND occurred_at < ${T}::timestamp`
          .returnsRow({ visitors: 'pg/int4@1', sessions: 'pg/int4@1' } as never)
          .build()
      ),
      run(
        db.raw.sql`SELECT name, COUNT(*)::int AS events, COUNT(DISTINCT anonymous_id)::int AS visitors
          FROM marketing_events WHERE occurred_at >= ${F}::timestamp AND occurred_at < ${T}::timestamp GROUP BY name`
          .returnsRow({ name: 'pg/text@1', events: 'pg/int4@1', visitors: 'pg/int4@1' } as never)
          .build()
      ),
      run(
        db.raw.sql`SELECT COUNT(*)::int AS orders,
            COALESCE(SUM(total), 0)::text AS revenue,
            COALESCE(SUM(shipping_cost), 0)::text AS shipping,
            COUNT(*) FILTER (WHERE marketing_consent = 'all')::int AS tracked_orders,
            COUNT(DISTINCT anonymous_id) FILTER (WHERE marketing_consent = 'all')::int AS buyers
          FROM orders WHERE channel = 'DIRECT' AND status IN ('PAYMENT_RECEIVED', 'CONFIRMED', 'PREPARING', 'IN_PRODUCTION', 'PACKING', 'SHIPPED', 'DELIVERED')
            AND created_at >= ${F}::timestamp AND created_at < ${T}::timestamp`
          .returnsRow({ orders: 'pg/int4@1', revenue: 'pg/text@1', shipping: 'pg/text@1', tracked_orders: 'pg/int4@1', buyers: 'pg/int4@1' } as never)
          .build()
      ),
      abandonment(F, T, 'add_to_cart'),
      abandonment(F, T, 'begin_checkout'),
      run(
        db.raw.sql`SELECT product_id, name, COUNT(DISTINCT anonymous_id)::int AS visitors
          FROM marketing_events
          WHERE occurred_at >= ${F}::timestamp AND occurred_at < ${T}::timestamp
            AND product_id IS NOT NULL AND name IN ('product_view', 'add_to_cart')
          GROUP BY product_id, name`
          .returnsRow({ product_id: 'pg/text@1', name: 'pg/text@1', visitors: 'pg/int4@1' } as never)
          .build()
      ),
      run(
        db.raw.sql`SELECT oi.product_id, MAX(oi.product_name) AS product_name, SUM(oi.quantity)::int AS units,
            SUM(oi.total)::text AS revenue,
            COUNT(DISTINCT o.anonymous_id) FILTER (WHERE o.marketing_consent = 'all')::int AS buyers
          FROM order_items oi JOIN orders o ON o.id = oi.order_id
          WHERE o.channel = 'DIRECT' AND o.status IN ('PAYMENT_RECEIVED', 'CONFIRMED', 'PREPARING', 'IN_PRODUCTION', 'PACKING', 'SHIPPED', 'DELIVERED')
            AND o.created_at >= ${F}::timestamp AND o.created_at < ${T}::timestamp
          GROUP BY oi.product_id`
          .returnsRow({ product_id: 'pg/text@1', product_name: 'pg/text@1', units: 'pg/int4@1', revenue: 'pg/text@1', buyers: 'pg/int4@1' } as never)
          .build()
      ),
      run(
        db.raw.sql`SELECT to_char(occurred_at + interval '3 hours', 'YYYY-MM-DD') AS day, COUNT(DISTINCT anonymous_id)::int AS visitors
          FROM marketing_events WHERE occurred_at >= ${F}::timestamp AND occurred_at < ${T}::timestamp GROUP BY 1`
          .returnsRow({ day: 'pg/text@1', visitors: 'pg/int4@1' } as never)
          .build()
      ),
      run(
        db.raw.sql`SELECT to_char(created_at + interval '3 hours', 'YYYY-MM-DD') AS day, COUNT(*)::int AS orders, COALESCE(SUM(total), 0)::text AS revenue
          FROM orders WHERE channel = 'DIRECT' AND status IN ('PAYMENT_RECEIVED', 'CONFIRMED', 'PREPARING', 'IN_PRODUCTION', 'PACKING', 'SHIPPED', 'DELIVERED')
            AND created_at >= ${F}::timestamp AND created_at < ${T}::timestamp GROUP BY 1`
          .returnsRow({ day: 'pg/text@1', orders: 'pg/int4@1', revenue: 'pg/text@1' } as never)
          .build()
      ),
      run(
        db.raw.sql`SELECT COALESCE(utm_source, '') AS source, COALESCE(utm_medium, '') AS medium, COALESCE(utm_campaign, '') AS campaign,
            COUNT(DISTINCT anonymous_id)::int AS visitors
          FROM marketing_events
          WHERE occurred_at >= ${F}::timestamp AND occurred_at < ${T}::timestamp AND utm_source IS NOT NULL
          GROUP BY 1, 2, 3`
          .returnsRow({ source: 'pg/text@1', medium: 'pg/text@1', campaign: 'pg/text@1', visitors: 'pg/int4@1' } as never)
          .build()
      ),
      run(
        db.raw.sql`SELECT COALESCE(attribution->'last'->>'utmSource', '') AS source,
            COALESCE(attribution->'last'->>'utmMedium', '') AS medium,
            COALESCE(attribution->'last'->>'utmCampaign', '') AS campaign,
            COUNT(*)::int AS orders, COALESCE(SUM(total), 0)::text AS revenue
          FROM orders WHERE channel = 'DIRECT' AND status IN ('PAYMENT_RECEIVED', 'CONFIRMED', 'PREPARING', 'IN_PRODUCTION', 'PACKING', 'SHIPPED', 'DELIVERED')
            AND created_at >= ${F}::timestamp AND created_at < ${T}::timestamp
            AND attribution->'last'->>'utmSource' IS NOT NULL
          GROUP BY 1, 2, 3`
          .returnsRow({ source: 'pg/text@1', medium: 'pg/text@1', campaign: 'pg/text@1', orders: 'pg/int4@1', revenue: 'pg/text@1' } as never)
          .build()
      ),
    ])

  const stepVisitors = new Map(steps.map((r) => [String(r.name), int(r.visitors)]))
  const stepEvents = new Map(steps.map((r) => [String(r.name), int(r.events)]))
  const o = orderTotals[0] ?? {}
  const orders = int(o.orders)
  const revenue = round2(Number(o.revenue ?? 0))
  const buyers = int(o.buyers)
  const visitors = int(totals[0]?.visitors)

  const funnel = buildFunnel({
    visitors,
    productViewers: stepVisitors.get('product_view') ?? 0,
    cartAdders: stepVisitors.get('add_to_cart') ?? 0,
    checkoutStarters: stepVisitors.get('begin_checkout') ?? 0,
    paymentStarters: stepVisitors.get('add_payment_info') ?? 0,
    buyers,
  })

  // Products: views and carts from events, sales from orders
  const viewers = new Map<string, number>()
  const adders = new Map<string, number>()
  for (const r of productEvents) (r.name === 'product_view' ? viewers : adders).set(String(r.product_id), int(r.visitors))
  const products: ProductMetrics[] = productOrders
    .map((r) => {
      const id = String(r.product_id)
      return {
        productId: id,
        name: String(r.product_name ?? id),
        viewers: viewers.get(id) ?? 0,
        cartAdders: adders.get(id) ?? 0,
        buyers: int(r.buyers),
        units: int(r.units),
        revenue: round2(Number(r.revenue ?? 0)),
        conversionRate: share(int(r.buyers), viewers.get(id) ?? 0),
      }
    })
    .sort((a, b) => b.revenue - a.revenue)

  // Days: every day of the period, so a quiet day shows as 0
  const visitorsByDay = new Map(eventDays.map((r) => [String(r.day), int(r.visitors)]))
  const ordersByDay = new Map(orderDays.map((r) => [String(r.day), { orders: int(r.orders), revenue: round2(Number(r.revenue ?? 0)) }]))
  const days: DayMetrics[] = []
  for (let d = range.start; d <= range.end; d = nextDay(d)) {
    days.push({ day: d, visitors: visitorsByDay.get(d) ?? 0, orders: ordersByDay.get(d)?.orders ?? 0, revenue: ordersByDay.get(d)?.revenue ?? 0 })
  }

  const key = (r: Rec) => `${r.source}\u0000${r.medium}\u0000${r.campaign}`
  const sources = new Map<string, SourceMetrics>()
  const at = (r: Rec): SourceMetrics => {
    const k = key(r)
    let s = sources.get(k)
    if (!s) sources.set(k, (s = { source: String(r.source), medium: String(r.medium), campaign: String(r.campaign), visitors: 0, orders: 0, revenue: 0 }))
    return s
  }
  for (const r of eventSources) at(r).visitors = int(r.visitors)
  for (const r of orderSources) {
    const s = at(r)
    s.orders = int(r.orders)
    s.revenue = round2(Number(r.revenue ?? 0))
  }

  return {
    period: { start: range.start, end: range.end },
    visitors,
    sessions: int(totals[0]?.sessions),
    productViews: stepEvents.get('product_view') ?? 0,
    addToCarts: stepEvents.get('add_to_cart') ?? 0,
    checkoutsStarted: stepEvents.get('begin_checkout') ?? 0,
    orders,
    revenue,
    shipping: round2(Number(o.shipping ?? 0)),
    averageOrderValue: averageOrderValue(revenue, orders),
    conversionRate: share(buyers, visitors),
    cartAbandonmentRate: abandonmentRate(int(abandonCart.reached), int(abandonCart.bought)),
    checkoutAbandonmentRate: abandonmentRate(int(abandonCheckout.reached), int(abandonCheckout.bought)),
    trackedOrderShare: share(int(o.tracked_orders), orders),
    funnel,
    products,
    days,
    sources: [...sources.values()].sort((a, b) => b.revenue - a.revenue || b.visitors - a.visitors),
  }
}

const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

/** Visitors who reached a step (`name`) and, of them, those who also have a consented sale in the period */
async function abandonment(from: string, to: string, name: 'add_to_cart' | 'begin_checkout') {
  const [row] = await run(
    db.raw.sql`SELECT COUNT(DISTINCT e.anonymous_id)::int AS reached,
        COUNT(DISTINCT e.anonymous_id) FILTER (WHERE EXISTS (
          SELECT 1 FROM orders o
          WHERE o.anonymous_id = e.anonymous_id AND o.marketing_consent = 'all' AND o.channel = 'DIRECT'
            AND o.status IN ('PAYMENT_RECEIVED', 'CONFIRMED', 'PREPARING', 'IN_PRODUCTION', 'PACKING', 'SHIPPED', 'DELIVERED')
            AND o.created_at >= ${from}::timestamp AND o.created_at < ${to}::timestamp
        ))::int AS bought
      FROM marketing_events e
      WHERE e.name = ${name} AND e.anonymous_id IS NOT NULL
        AND e.occurred_at >= ${from}::timestamp AND e.occurred_at < ${to}::timestamp`
      .returnsRow({ reached: 'pg/int4@1', bought: 'pg/int4@1' } as never)
      .build()
  )
  return { reached: int(row?.reached), bought: int(row?.bought) }
}

export interface InternalReport {
  generatedAt: string
  current: InternalMetrics
  previous: InternalMetrics
}

/** The period and the one just before it, so every number can be shown with its change */
export async function getInternalReport(period: AnalyticsPeriod): Promise<InternalReport> {
  const [current, previous] = await Promise.all([
    getInternalMetrics({ start: period.start, end: period.end }),
    getInternalMetrics(period.previous),
  ])
  return { generatedAt: new Date().toISOString(), current, previous }
}

