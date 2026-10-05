import { round2, share } from './internal'

/**
 * Product analytics: how each product does from first view to sale, and which products
 * deserve attention. Pure functions; the service (services/analytics/product-analytics.service.ts)
 * runs the queries.
 *
 * Same rule as the rest of the internal analytics: visitor numbers (views, carts, checkouts)
 * are consented visitors from the event log; units and revenue are every sale from the orders
 * table. A conversion rate only ever divides consented buyers by consented viewers.
 */

export interface EventCount {
  productId: string
  /** product_view | add_to_cart | begin_checkout_item */
  name: string
  events: number
  visitors: number
}

export interface SaleRow {
  productId: string
  productName: string
  units: number
  revenue: number
  orders: number
  /** Consented visitors who bought it */
  buyers: number
}

export interface SourceSale {
  productId: string
  source: string
  medium: string
  campaign: string
  orders: number
  units: number
  revenue: number
}

export interface ProductSource {
  source: string
  medium: string
  campaign: string
  orders: number
  units: number
  revenue: number
}

export interface ProductRow {
  productId: string
  name: string
  views: number
  viewers: number
  cartAdders: number
  checkoutStarters: number
  buyers: number
  orders: number
  units: number
  revenue: number
  /** Average selling price per unit, after discounts */
  averagePrice: number | null
  /** Shares between consented visitors */
  viewToCart: number | null
  cartToCheckout: number | null
  conversionRate: number | null
  /** Where the sales came from (last campaign touch of the order) */
  sources: ProductSource[]
}

export interface ProductBuildInput {
  events: EventCount[]
  sales: SaleRow[]
  sources: SourceSale[]
  /** Names for products that have views but no sale */
  names: Map<string, string>
}

/** One row per product that was seen, carted, checked out or sold in the period */
export function buildProductRows({ events, sales, sources, names }: ProductBuildInput): ProductRow[] {
  const ids = new Set<string>([...events.map((e) => e.productId), ...sales.map((s) => s.productId)])
  const eventOf = (id: string, name: string) => events.find((e) => e.productId === id && e.name === name)
  const saleOf = new Map(sales.map((s) => [s.productId, s]))
  const sourcesOf = new Map<string, ProductSource[]>()
  for (const s of sources) {
    const list = sourcesOf.get(s.productId) ?? []
    list.push({ source: s.source, medium: s.medium, campaign: s.campaign, orders: s.orders, units: s.units, revenue: round2(s.revenue) })
    sourcesOf.set(s.productId, list)
  }

  return [...ids]
    .map((id): ProductRow => {
      const sale = saleOf.get(id)
      const viewers = eventOf(id, 'product_view')?.visitors ?? 0
      const cartAdders = eventOf(id, 'add_to_cart')?.visitors ?? 0
      const checkoutStarters = eventOf(id, 'begin_checkout_item')?.visitors ?? 0
      const buyers = sale?.buyers ?? 0
      const units = sale?.units ?? 0
      const revenue = round2(sale?.revenue ?? 0)
      return {
        productId: id,
        name: sale?.productName || names.get(id) || id,
        views: eventOf(id, 'product_view')?.events ?? 0,
        viewers,
        cartAdders,
        checkoutStarters,
        buyers,
        orders: sale?.orders ?? 0,
        units,
        revenue,
        averagePrice: units > 0 ? round2(revenue / units) : null,
        viewToCart: share(cartAdders, viewers),
        cartToCheckout: share(checkoutStarters, cartAdders),
        conversionRate: share(buyers, viewers),
        sources: (sourcesOf.get(id) ?? []).sort((a, b) => b.revenue - a.revenue || b.orders - a.orders).slice(0, 5),
      }
    })
    .sort((a, b) => b.revenue - a.revenue || b.viewers - a.viewers || a.name.localeCompare(b.name, 'tr'))
}

export interface Rankings {
  mostViewed: ProductRow[]
  mostAddedToCart: ProductRow[]
  bestSelling: ProductRow[]
}

export function rankings(rows: ProductRow[], limit = 5): Rankings {
  const top = (key: (r: ProductRow) => number) =>
    rows
      .filter((r) => key(r) > 0)
      .sort((a, b) => key(b) - key(a))
      .slice(0, limit)
  return {
    mostViewed: top((r) => r.viewers),
    mostAddedToCart: top((r) => r.cartAdders),
    bestSelling: top((r) => r.units),
  }
}

export interface OpportunityOptions {
  /** A product seen by fewer visitors than this is too little data to judge */
  minViewers?: number
  limit?: number
}

export interface ProductOpportunities {
  /** Looked at a lot, bought rarely or never: price, photos, description or stock may be putting people off */
  highViewsLowSales: ProductRow[]
  /** Converts well but few people see it: worth sending more traffic to */
  highSalesLowTraffic: ProductRow[]
}

const median = (values: number[]): number => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * `shopConversion` is the whole shop's conversion (consented buyers / consented visitors);
 * a product is judged against it. null (nobody has bought yet) leaves only the clearest case:
 * seen often, sold never.
 */
export function opportunities(rows: ProductRow[], shopConversion: number | null, { minViewers = 10, limit = 6 }: OpportunityOptions = {}): ProductOpportunities {
  const highViewsLowSales = rows
    .filter((r) => {
      if (r.viewers < minViewers) return false
      if (r.units === 0) return true
      // sold, but only to visitors we cannot follow: no basis to call it weak
      if (r.buyers === 0 || shopConversion === null || r.conversionRate === null) return false
      return r.conversionRate < shopConversion * 0.5
    })
    .sort((a, b) => b.viewers - a.viewers)
    .slice(0, limit)

  const viewed = rows.filter((r) => r.viewers > 0).map((r) => r.viewers)
  const lowTraffic = Math.max(minViewers, median(viewed))
  const highSalesLowTraffic =
    shopConversion === null || shopConversion <= 0
      ? []
      : rows
          .filter((r) => r.buyers > 0 && r.viewers > 0 && r.viewers < lowTraffic && (r.conversionRate ?? 0) >= shopConversion * 2)
          .sort((a, b) => (b.conversionRate ?? 0) - (a.conversionRate ?? 0))
          .slice(0, limit)

  return { highViewsLowSales, highSalesLowTraffic }
}
