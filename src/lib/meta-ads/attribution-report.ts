/**
 * "Which ad really brought sales": Meta's own numbers (spend, the purchases Meta credits) set beside what the
 * shop measured itself (visitors and carts from its own event log, orders and revenue from the orders table).
 * Pure functions; the queries are in services/meta-attribution.service.ts.
 *
 * Rules:
 * - The shop's orders are the truth for sales; Meta's figure is shown as Meta's claim, never added to it.
 * - A visit is matched to a Meta campaign by its `utm_campaign` value, which is either the campaign's id
 *   (what ads made in this panel carry) or its name (what is often typed by hand). Id first, then name.
 * - Orders and visits that came from Meta (utm_source facebook/instagram/…, or an fbclid) but name no known
 *   campaign are not dropped: they are reported on their own line, so the totals still add up.
 * - Last touch: an order belongs to the last campaign visit before it. Sales that Meta influenced earlier but
 *   that arrived through another door (a direct visit later) are not counted here, so the shop's figure is
 *   normally lower than Meta's. That gap is expected, not an error.
 */

import type { NamedMetrics } from './insights'

export const META_UTM_SOURCES = ['facebook', 'fb', 'instagram', 'ig', 'meta'] as const

export function isMetaSource(source: string | null | undefined): boolean {
  return META_UTM_SOURCES.includes(String(source ?? '').trim().toLowerCase() as never)
}

/** Visitors and steps the shop's own event log saw, grouped by the utm_campaign they arrived with ('' = none) */
export interface EventTouchRow {
  campaign: string
  visitors: number
  cartAdders: number
  checkoutStarters: number
}

/** Orders grouped by the utm_campaign of their last touch ('' = none) */
export interface OrderTouchRow {
  campaign: string
  orders: number
  revenue: number
}

export interface CampaignResult {
  id: string
  name: string
  spend: number
  /** What Meta says */
  metaPurchases: number
  metaValue: number
  metaRoas: number | null
  /** What the shop measured */
  visitors: number
  cartAdders: number
  checkoutStarters: number
  orders: number
  revenue: number
  /** revenue / spend */
  realRoas: number | null
  /** spend / orders */
  costPerOrder: number | null
}

export interface Totals {
  spend: number
  metaPurchases: number
  metaValue: number
  metaRoas: number | null
  visitors: number
  cartAdders: number
  checkoutStarters: number
  orders: number
  revenue: number
  realRoas: number | null
  costPerOrder: number | null
}

export interface AttributionResult {
  campaigns: CampaignResult[]
  /** Meta traffic and sales whose campaign tag matches no campaign in the account, or has none */
  unassigned: { visitors: number; cartAdders: number; checkoutStarters: number; orders: number; revenue: number; tags: string[] }
  totals: Totals
}

const key = (v: string) => v.trim().toLowerCase()
const div = (a: number, b: number) => (b > 0 ? a / b : null)

function totalsOf(
  spend: number,
  metaPurchases: number,
  metaValue: number,
  rest: { visitors: number; cartAdders: number; checkoutStarters: number; orders: number; revenue: number }
): Totals {
  return {
    spend,
    metaPurchases,
    metaValue,
    metaRoas: div(metaValue, spend),
    ...rest,
    realRoas: div(rest.revenue, spend),
    costPerOrder: div(spend, rest.orders),
  }
}

export function joinCampaigns(meta: NamedMetrics[], events: EventTouchRow[], orders: OrderTouchRow[]): AttributionResult {
  const byEvent = new Map<string, EventTouchRow[]>()
  const byOrder = new Map<string, OrderTouchRow[]>()
  for (const e of events) byEvent.set(key(e.campaign), [...(byEvent.get(key(e.campaign)) ?? []), e])
  for (const o of orders) byOrder.set(key(o.campaign), [...(byOrder.get(key(o.campaign)) ?? []), o])

  const usedEvents = new Set<string>()
  const usedOrders = new Set<string>()
  const take = <T>(map: Map<string, T[]>, used: Set<string>, campaign: NamedMetrics): T[] => {
    const out: T[] = []
    // A tag equal to the id wins; a name is accepted too. Each tag goes to at most one campaign (tracked per kind of row).
    for (const k of new Set([key(campaign.id), key(campaign.name)])) {
      if (!k || used.has(k)) continue
      const rows = map.get(k)
      if (rows) {
        out.push(...rows)
        used.add(k)
      }
    }
    return out
  }

  const campaigns: CampaignResult[] = meta.map((c) => {
    const ev = take(byEvent, usedEvents, c)
    const od = take(byOrder, usedOrders, c)
    const visitors = ev.reduce((a, r) => a + r.visitors, 0)
    const cartAdders = ev.reduce((a, r) => a + r.cartAdders, 0)
    const checkoutStarters = ev.reduce((a, r) => a + r.checkoutStarters, 0)
    const orderCount = od.reduce((a, r) => a + r.orders, 0)
    const revenue = od.reduce((a, r) => a + r.revenue, 0)
    return {
      id: c.id,
      name: c.name,
      spend: c.metrics.spend,
      metaPurchases: c.metrics.purchases,
      metaValue: c.metrics.purchaseValue,
      metaRoas: c.metrics.roas,
      visitors,
      cartAdders,
      checkoutStarters,
      orders: orderCount,
      revenue,
      realRoas: div(revenue, c.metrics.spend),
      costPerOrder: div(c.metrics.spend, orderCount),
    }
  })

  const leftEvents = events.filter((e) => !usedEvents.has(key(e.campaign)))
  const leftOrders = orders.filter((o) => !usedOrders.has(key(o.campaign)))
  const unassigned = {
    visitors: leftEvents.reduce((a, r) => a + r.visitors, 0),
    cartAdders: leftEvents.reduce((a, r) => a + r.cartAdders, 0),
    checkoutStarters: leftEvents.reduce((a, r) => a + r.checkoutStarters, 0),
    orders: leftOrders.reduce((a, r) => a + r.orders, 0),
    revenue: leftOrders.reduce((a, r) => a + r.revenue, 0),
    tags: [...new Set([...leftEvents, ...leftOrders].map((r) => r.campaign.trim()).filter(Boolean))].sort(),
  }

  const sum = (f: (c: CampaignResult) => number) => campaigns.reduce((a, c) => a + f(c), 0)
  const totals = totalsOf(
    sum((c) => c.spend),
    sum((c) => c.metaPurchases),
    sum((c) => c.metaValue),
    {
      visitors: sum((c) => c.visitors) + unassigned.visitors,
      cartAdders: sum((c) => c.cartAdders) + unassigned.cartAdders,
      checkoutStarters: sum((c) => c.checkoutStarters) + unassigned.checkoutStarters,
      orders: sum((c) => c.orders) + unassigned.orders,
      revenue: sum((c) => c.revenue) + unassigned.revenue,
    }
  )
  return { campaigns: campaigns.sort((a, b) => b.spend - a.spend), unassigned, totals }
}

/** How Meta's claimed sales compare with the shop's own count: "ok" within 25 %, else which side is higher */
export function compareSales(metaValue: number, shopRevenue: number): { verdict: 'none' | 'close' | 'meta-higher' | 'shop-higher'; ratio: number | null } {
  if (metaValue <= 0 && shopRevenue <= 0) return { verdict: 'none', ratio: null }
  if (metaValue <= 0) return { verdict: 'shop-higher', ratio: null }
  const ratio = shopRevenue / metaValue
  if (ratio >= 0.75 && ratio <= 1.25) return { verdict: 'close', ratio }
  return { verdict: ratio < 1 ? 'meta-higher' : 'shop-higher', ratio }
}
