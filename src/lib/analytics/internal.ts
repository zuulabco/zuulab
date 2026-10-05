import type { MarketingEvent } from '@/lib/marketing/events'
import { shiftDay } from './period'

/**
 * ZUULAB's own analytics: the rules that do not need a database. The service
 * (services/analytics/internal-analytics.service.ts) runs the queries; this file decides
 * what is stored for an event, which instants a report period covers, and how the counts
 * become rates.
 *
 * Two data sources, on purpose:
 * - `marketing_events`: what visitors did (views, carts, checkouts), only for visitors who
 *   accepted "all" cookies. Funnel steps, visitors and abandonment come from here.
 * - `orders`: what was sold. Orders, revenue and the "purchase" step come from here, so a
 *   sale is never lost to an ad blocker or a refused cookie banner, and the number can be
 *   checked against the admin's order list.
 * A rate is only ever computed between numbers of the same population (consented
 * visitors against consented buyers), never consented visitors against all orders.
 */

// ── What is stored per event ─────────────────────────────────────────

export interface EventRow {
  eventId: string
  name: string
  occurredAt: Date
  anonymousId: string | null
  sessionId: string | null
  productId: string | null
  value: number | null
  pagePath: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmContent: string | null
}

/** Events that are not stored: a purchase comes from `orders`, never from a browser event */
export const NOT_STORED = new Set(['purchase'])

const cut = (v: string | undefined | null, max: number): string | null => {
  const s = (v ?? '').trim().slice(0, max)
  return s || null
}

/** "https://www.zuulab.com/urun/x?utm=1#a" → "/urun/x": the query string can carry personal data, so it is dropped */
export function pagePathOf(pageUrl: string | undefined): string | null {
  if (!pageUrl) return null
  try {
    return cut(new URL(pageUrl, 'https://x.invalid').pathname, 300)
  } catch {
    return null
  }
}

/** The row to store for an event, or null when this event is not kept */
export function eventRow(event: MarketingEvent): EventRow | null {
  if (NOT_STORED.has(event.eventName)) return null
  const only = event.items && event.items.length === 1 ? event.items[0] : undefined
  const productId = event.productId ?? only?.productId ?? null
  const single = event.price !== undefined ? event.price * (event.quantity ?? 1) : undefined
  const value = event.value ?? single ?? null
  return {
    eventId: event.eventId.slice(0, 100),
    name: event.eventName,
    occurredAt: new Date(event.timestamp),
    anonymousId: cut(event.anonymousId, 64),
    sessionId: cut(event.sessionId, 64),
    productId: cut(productId, 100),
    value: value === null ? null : Math.round(value * 100) / 100,
    pagePath: pagePathOf(event.pageUrl),
    utmSource: cut(event.utmSource, 200),
    utmMedium: cut(event.utmMedium, 200),
    utmCampaign: cut(event.utmCampaign, 200),
    utmContent: cut(event.utmContent, 200),
  }
}

/** Internal row name for one product of a checkout: lets a many-product checkout count for each of its products */
export const CHECKOUT_ITEM = 'begin_checkout_item'

/**
 * Everything to store for an event: its row, plus (for a checkout) one row per product in it,
 * so product-level checkout numbers exist even when the checkout holds several products.
 * The extra rows have their own name, so visitor and funnel counts are not affected.
 */
export function eventRows(event: MarketingEvent): EventRow[] {
  const main = eventRow(event)
  if (!main) return []
  if (event.eventName !== 'begin_checkout' || !event.items?.length) return [main]
  const byProduct = new Map<string, number>()
  for (const i of event.items.slice(0, 20)) byProduct.set(i.productId, (byProduct.get(i.productId) ?? 0) + i.price * i.quantity)
  const items = [...byProduct.entries()].map(([productId, value]) => ({
    ...main,
    eventId: `${main.eventId}:${productId}`.slice(0, 100),
    name: CHECKOUT_ITEM,
    productId: cut(productId, 100),
    value: Math.round(value * 100) / 100,
  }))
  return [main, ...items]
}

// ── Report periods ───────────────────────────────────────────────────

/** Türkiye has had a fixed UTC+3 offset since 2016, so a Turkish calendar day starts at 21:00 UTC the day before */
const TURKEY_OFFSET_HOURS = 3

const utcWallClock = (day: string, hours: number) => {
  const d = new Date(Date.parse(`${day}T00:00:00Z`) + hours * 3_600_000)
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

/**
 * The instants a span of Turkish calendar days covers, as UTC wall-clock text (how the
 * database stores timestamps): `from` inclusive, `to` exclusive.
 */
export function periodBounds(range: { start: string; end: string }): { from: string; to: string } {
  return {
    from: utcWallClock(range.start, -TURKEY_OFFSET_HOURS),
    to: utcWallClock(shiftDay(range.end, 1), -TURKEY_OFFSET_HOURS),
  }
}

// ── Counts → metrics ─────────────────────────────────────────────────

/** a / b as a 0–1 share; null when there is nothing to divide by (never a fake 0 %) */
export function share(a: number, b: number): number | null {
  return b > 0 ? a / b : null
}

export interface FunnelCounts {
  /** Visitors who did anything */
  visitors: number
  productViewers: number
  cartAdders: number
  checkoutStarters: number
  paymentStarters: number
  /** Consented visitors who bought (from orders) */
  buyers: number
}

export interface FunnelStep {
  key: keyof FunnelCounts
  label: string
  visitors: number
  /** Share of the first step */
  ofVisitors: number | null
  /** Share of the step before */
  ofPrevious: number | null
}

const FUNNEL_LABELS: Array<[keyof FunnelCounts, string]> = [
  ['visitors', 'Ziyaretçi'],
  ['productViewers', 'Ürün görüntüleyen'],
  ['cartAdders', 'Sepete ekleyen'],
  ['checkoutStarters', 'Ödemeye geçen'],
  ['paymentStarters', 'Ödeme bilgisi giren'],
  ['buyers', 'Satın alan'],
]

export function buildFunnel(c: FunnelCounts): FunnelStep[] {
  return FUNNEL_LABELS.map(([key, label], i) => ({
    key,
    label,
    visitors: c[key],
    ofVisitors: share(c[key], c.visitors),
    ofPrevious: i === 0 ? null : share(c[key], c[FUNNEL_LABELS[i - 1][0]]),
  }))
}

/** Of the visitors who reached a step, the share that never bought (within the same period) */
export function abandonmentRate(reached: number, reachedAndBought: number): number | null {
  return share(Math.max(0, reached - reachedAndBought), reached)
}

export const round2 = (n: number) => Math.round(n * 100) / 100

/** Average order value: what customers paid per order, shipping included */
export function averageOrderValue(revenue: number, orders: number): number | null {
  return orders > 0 ? round2(revenue / orders) : null
}
