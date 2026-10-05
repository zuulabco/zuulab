import { describe, expect, it } from 'vitest'
import { buildProductRows, opportunities, rankings, type ProductRow } from '@/lib/analytics/product-insights'
import { eventRows } from '@/lib/analytics/internal'
import { buildEvent, type MarketingEvent } from '@/lib/marketing/events'

const names = new Map([
  ['a', 'Aşk Vazosu'],
  ['b', 'Nox Lamba'],
  ['c', 'Hippo'],
  ['d', 'Sessiz Ürün'],
])

const rows = () =>
  buildProductRows({
    names,
    events: [
      { productId: 'a', name: 'product_view', events: 120, visitors: 80 },
      { productId: 'a', name: 'add_to_cart', events: 20, visitors: 16 },
      { productId: 'a', name: 'begin_checkout_item', events: 9, visitors: 8 },
      { productId: 'b', name: 'product_view', events: 40, visitors: 30 },
      { productId: 'b', name: 'add_to_cart', events: 3, visitors: 3 },
      { productId: 'c', name: 'product_view', events: 12, visitors: 5 },
      { productId: 'd', name: 'product_view', events: 3, visitors: 2 },
    ],
    sales: [
      { productId: 'a', productName: 'Aşk Vazosu', units: 6, revenue: 899.5, orders: 5, buyers: 4 },
      { productId: 'c', productName: 'Hippo', units: 4, revenue: 400, orders: 3, buyers: 3 },
      { productId: 'z', productName: 'Sadece satıldı', units: 1, revenue: 50, orders: 1, buyers: 0 },
    ],
    sources: [
      { productId: 'a', source: 'meta', medium: 'paid_social', campaign: 'yaz', orders: 3, units: 4, revenue: 600 },
      { productId: 'a', source: 'google', medium: 'organic', campaign: '', orders: 1, units: 1, revenue: 150 },
      { productId: 'a', source: 'meta', medium: 'paid_social', campaign: 'kis', orders: 1, units: 1, revenue: 149.5 },
    ],
  })

const by = (list: ProductRow[], id: string) => list.find((r) => r.productId === id)!

describe('product rows', () => {
  it('has a row for every product seen or sold, sold-only and view-only included', () => {
    expect(rows().map((r) => r.productId).sort()).toEqual(['a', 'b', 'c', 'd', 'z'])
    expect(by(rows(), 'z').name).toBe('Sadece satıldı') // sale snapshot name
    expect(by(rows(), 'd').name).toBe('Sessiz Ürün') // never sold: name from the catalog
  })

  it('computes the path from view to sale', () => {
    const a = by(rows(), 'a')
    expect(a).toMatchObject({ views: 120, viewers: 80, cartAdders: 16, checkoutStarters: 8, buyers: 4, orders: 5, units: 6, revenue: 899.5 })
    expect(a.averagePrice).toBeCloseTo(149.92, 2)
    expect(a.viewToCart).toBeCloseTo(0.2)
    expect(a.cartToCheckout).toBeCloseTo(0.5)
    expect(a.conversionRate).toBeCloseTo(4 / 80)
  })

  it('shares are null with nothing to divide by, and a product that never sold has no average price', () => {
    const z = by(rows(), 'z')
    expect(z.conversionRate).toBeNull() // sold, but never seen by a followed visitor
    const d = by(rows(), 'd')
    expect(d.averagePrice).toBeNull()
    expect(d.conversionRate).toBe(0)
  })

  it('lists where the sales came from, biggest first, per product', () => {
    expect(by(rows(), 'a').sources.map((s) => `${s.source}/${s.campaign || '-'}:${s.revenue}`)).toEqual(['meta/yaz:600', 'google/-:150', 'meta/kis:149.5'])
    expect(by(rows(), 'b').sources).toEqual([])
  })

  it('orders products by revenue', () => {
    expect(rows().map((r) => r.productId).slice(0, 3)).toEqual(['a', 'c', 'z'])
  })
})

describe('rankings', () => {
  it('most viewed, most carted and best selling, never listing a product with none', () => {
    const r = rankings(rows(), 2)
    expect(r.mostViewed.map((p) => p.productId)).toEqual(['a', 'b'])
    expect(r.mostAddedToCart.map((p) => p.productId)).toEqual(['a', 'b'])
    expect(r.bestSelling.map((p) => p.productId)).toEqual(['a', 'c'])
    expect(rankings(buildProductRows({ names: new Map(), events: [], sales: [], sources: [] })).bestSelling).toEqual([])
  })
})

describe('opportunities', () => {
  it('high views, low sales: seen by many, never bought or far below the shop rate', () => {
    // shop converts 5%: a converts 5% (fine), b has 30 viewers and no sale (flagged), c has too few viewers to judge
    const o = opportunities(rows(), 0.05)
    expect(o.highViewsLowSales.map((r) => r.productId)).toEqual(['b'])
  })

  it('a product with a weak rate is flagged even though it sold', () => {
    const list = buildProductRows({
      names,
      events: [{ productId: 'a', name: 'product_view', events: 300, visitors: 200 }],
      sales: [{ productId: 'a', productName: 'A', units: 2, revenue: 200, orders: 2, buyers: 2 }],
      sources: [],
    })
    expect(opportunities(list, 0.05).highViewsLowSales.map((r) => r.productId)).toEqual(['a']) // 1% vs 5%
    expect(opportunities(list, 0.01).highViewsLowSales).toEqual([])
  })

  it('sold only to visitors we cannot follow is not called weak', () => {
    const list = buildProductRows({
      names,
      events: [{ productId: 'a', name: 'product_view', events: 100, visitors: 100 }],
      sales: [{ productId: 'a', productName: 'A', units: 3, revenue: 300, orders: 3, buyers: 0 }],
      sources: [],
    })
    expect(opportunities(list, 0.05).highViewsLowSales).toEqual([])
  })

  it('high sales, low traffic: converts at least twice the shop rate but few people see it', () => {
    const list = buildProductRows({
      names,
      events: [
        { productId: 'a', name: 'product_view', events: 500, visitors: 400 },
        { productId: 'b', name: 'product_view', events: 40, visitors: 30 },
        { productId: 'c', name: 'product_view', events: 8, visitors: 6 },
      ],
      sales: [
        { productId: 'a', productName: 'A', units: 8, revenue: 800, orders: 8, buyers: 8 },
        { productId: 'c', productName: 'C', units: 2, revenue: 200, orders: 2, buyers: 2 },
      ],
      sources: [],
    })
    const o = opportunities(list, 0.02)
    expect(o.highSalesLowTraffic.map((r) => r.productId)).toEqual(['c']) // 33 % on 6 views; a converts 2 % on 400
  })

  it('without any sale in the shop yet, only the clearest case is shown and nothing is invented', () => {
    const o = opportunities(rows(), null)
    expect(o.highSalesLowTraffic).toEqual([])
    expect(o.highViewsLowSales.map((r) => r.productId)).toEqual(['b'])
  })
})

describe('checkout rows per product', () => {
  const ev = (data: Parameters<typeof buildEvent>[1]): MarketingEvent =>
    buildEvent('begin_checkout', { anonymousId: 'a1', sessionId: 's1', ...data }, { source: 'browser', consent: 'all' })

  it('a many-product checkout gets one extra row per product, with its own name', () => {
    const rows = eventRows(
      ev({
        eventId: 'chk-0001',
        value: 350,
        items: [
          { productId: 'p1', productName: 'a', quantity: 2, price: 100 },
          { productId: 'p2', productName: 'b', quantity: 1, price: 150 },
          { productId: 'p1', productName: 'a', quantity: 1, price: 100 },
        ],
      })
    )
    expect(rows.map((r) => [r.name, r.productId, r.value])).toEqual([
      ['begin_checkout', null, 350],
      ['begin_checkout_item', 'p1', 300],
      ['begin_checkout_item', 'p2', 150],
    ])
    expect(new Set(rows.map((r) => r.eventId)).size).toBe(3) // each row has its own unique id
    expect(rows[1].eventId).toBe('chk-0001:p1')
  })

  it('other events and purchases are unchanged', () => {
    expect(eventRows(buildEvent('add_to_cart', { productId: 'p1', productName: 'a', quantity: 1, price: 5 }, { source: 'browser', consent: 'all' }))).toHaveLength(1)
    expect(eventRows(buildEvent('purchase', { orderId: 'X', value: 1 }, { source: 'browser', consent: 'all' }))).toEqual([])
  })
})
