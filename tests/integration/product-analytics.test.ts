/**
 * Product analytics against the real Postgres database (DATABASE_URL): the SQL behind views,
 * carts, checkouts, sales, revenue, average price and sales sources per product.
 *
 * Everything lives in a window of April 2019, where the shop has no real data, so the numbers can
 * be asserted exactly. Rows are tagged with a run id and removed in afterAll; no product is
 * created (two existing ones are only referenced), so nothing shows on the shop.
 * Run with: npm run test:integration
 */
import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { db } = await import('@/prisma/db')
const { toDbTimestamp } = await import('@/lib/db/time')
const { storeEvent } = await import('@/lib/services/analytics/internal-analytics.service')
const { getProductMetrics } = await import('@/lib/services/analytics/product-analytics.service')
const { eventRows } = await import('@/lib/analytics/internal')
const { buildEvent } = await import('@/lib/marketing/events')

const RUN = `zp${Date.now().toString(36)}`
const RANGE = { start: '2019-04-10', end: '2019-04-11' }
const run = (plan: Parameters<ReturnType<typeof db.runtime>['execute']>[0]) => db.runtime().execute(plan)

let p1 = { id: '', name: '' }
let p2 = { id: '', name: '' }
let userId = ''
let seq = 0

async function track(name: Parameters<typeof buildEvent>[0], anon: string, data: Parameters<typeof buildEvent>[1], utm: object = {}) {
  const event = buildEvent(name, { eventId: `${RUN}-${++seq}`, anonymousId: anon, sessionId: `s-${anon}`, ...utm, ...data }, { source: 'browser', consent: 'all' })
  event.timestamp = Date.parse('2019-04-10T09:00:00Z')
  for (const row of eventRows(event)) await storeEvent(row)
}

interface Line {
  productId: string
  name: string
  qty: number
  total: number
}

async function order(n: number, o: { status: string; consent: 'all' | null; anon: string | null; attribution?: object; at: string; lines: Line[] }) {
  const total = o.lines.reduce((s, l) => s + l.total, 0)
  const created = await (db.orm.public.Order as any).create({
    orderNumber: `ZP-${RUN}-${n}`,
    userId,
    status: o.status,
    subtotal: total.toFixed(2),
    total: total.toFixed(2),
    shipToName: 'T',
    shipToPhone: '0',
    shipToAddress: 'T',
    shipToCity: 'T',
    shipToDistrict: 'T',
    shipToPostal: '1',
    channel: 'DIRECT',
    marketingConsent: o.consent,
    anonymousId: o.anon,
    attribution: o.attribution ?? null,
    createdAt: toDbTimestamp(new Date(o.at)),
  })
  for (const l of o.lines) {
    await (db.orm.public.OrderItem as any).create({
      orderId: created.id,
      productId: l.productId,
      productName: l.name,
      sku: 'ZP',
      quantity: l.qty,
      unitPrice: (l.total / l.qty).toFixed(2),
      taxRate: '20.00',
      total: l.total.toFixed(2),
    })
  }
}

beforeAll(async () => {
  const products = (await db.orm.public.Product.select('id', 'name').all()).slice(0, 2)
  if (products.length < 2) throw new Error('Integration tests need at least two product rows.')
  p1 = products[0]
  p2 = products[1]
  userId = (await db.orm.public.User.create({ email: `${RUN}@example.com`, name: 'T', role: 'CUSTOMER', status: 'ACTIVE' } as never)).id

  const meta = { utmSource: `${RUN}_meta`, utmMedium: 'paid_social', utmCampaign: 'yaz' }
  const line1 = (id: string, name: string, qty = 1, price = 100) => ({ productId: id, productName: name, quantity: qty, price })
  // A views both, carts p1, checks out both together, and buys p1
  await track('product_view', 'A', { productId: p1.id, productName: p1.name, price: 100, currency: 'TRY' }, meta)
  await track('product_view', 'A', { productId: p1.id, productName: p1.name, price: 100, currency: 'TRY' }, meta) // second view: counts as a view, not a second viewer
  await track('product_view', 'A', { productId: p2.id, productName: p2.name, price: 50, currency: 'TRY' })
  await track('add_to_cart', 'A', { productId: p1.id, productName: p1.name, quantity: 1, price: 100, currency: 'TRY' })
  await track('begin_checkout', 'A', { items: [line1(p1.id, p1.name), line1(p2.id, p2.name, 1, 50)], value: 150, currency: 'TRY' })
  // B views p1 only, C views p1 and carts it
  await track('product_view', 'B', { productId: p1.id, productName: p1.name, price: 100, currency: 'TRY' })
  await track('product_view', 'C', { productId: p1.id, productName: p1.name, price: 100, currency: 'TRY' })
  await track('add_to_cart', 'C', { productId: p1.id, productName: p1.name, quantity: 1, price: 100, currency: 'TRY' })

  // A buys 2 x p1 for 180 (campaign order); an untracked visitor buys p2 for 50; a cancelled order is left out
  await order(1, { status: 'CONFIRMED', consent: 'all', anon: 'A', at: '2019-04-11T09:00:00Z', attribution: { last: meta }, lines: [{ productId: p1.id, name: p1.name, qty: 2, total: 180 }] })
  await order(2, { status: 'DELIVERED', consent: null, anon: null, at: '2019-04-11T10:00:00Z', lines: [{ productId: p2.id, name: p2.name, qty: 1, total: 50 }] })
  await order(3, { status: 'CANCELLED', consent: 'all', anon: 'B', at: '2019-04-11T11:00:00Z', lines: [{ productId: p1.id, name: p1.name, qty: 5, total: 999 }] })
}, 90_000)

afterAll(async () => {
  await run(db.raw.sql`DELETE FROM marketing_events WHERE event_id LIKE ${`${RUN}-%`}`.affectedCount().build())
  if (userId) {
    await run(db.raw.sql`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id = ${userId})`.affectedCount().build())
    await run(db.raw.sql`DELETE FROM orders WHERE user_id = ${userId}`.affectedCount().build())
    await run(db.raw.sql`DELETE FROM users WHERE id = ${userId}`.affectedCount().build())
  }
  await db.close()
}, 60_000)

describe('product analytics against the database', () => {
  it('product 1: views, viewers, carts, checkouts, sales, revenue and average price', async () => {
    const m = await getProductMetrics(RANGE)
    const a = m.products.find((p) => p.productId === p1.id)!
    expect(a).toMatchObject({ views: 4, viewers: 3, cartAdders: 2, checkoutStarters: 1, buyers: 1, orders: 1, units: 2, revenue: 180, averagePrice: 90 })
    expect(a.viewToCart).toBeCloseTo(2 / 3)
    expect(a.cartToCheckout).toBeCloseTo(0.5)
    expect(a.conversionRate).toBeCloseTo(1 / 3)
  })

  it('product 2: a many-product checkout counts for each product; a sale to an untracked visitor counts as a sale, not as a tracked buyer', async () => {
    const m = await getProductMetrics(RANGE)
    const b = m.products.find((p) => p.productId === p2.id)!
    expect(b).toMatchObject({ views: 1, viewers: 1, cartAdders: 0, checkoutStarters: 1, buyers: 0, orders: 1, units: 1, revenue: 50, averagePrice: 50 })
    expect(b.conversionRate).toBe(0)
  })

  it('the cancelled order is left out, and the products are ranked by revenue', async () => {
    const m = await getProductMetrics(RANGE)
    const ours = m.products.filter((p) => p.productId === p1.id || p.productId === p2.id)
    expect(ours.map((p) => p.productId)).toEqual([p1.id, p2.id])
    expect(m.rankings.bestSelling.slice(0, 2).map((p) => p.productId)).toEqual([p1.id, p2.id])
  })

  it('where a product sold: the campaign of the order, and nothing for an order without one', async () => {
    const m = await getProductMetrics(RANGE)
    const a = m.products.find((p) => p.productId === p1.id)!
    expect(a.sources).toEqual([{ source: `${RUN}_meta`, medium: 'paid_social', campaign: 'yaz', orders: 1, units: 2, revenue: 180 }])
    expect(m.products.find((p) => p.productId === p2.id)!.sources).toEqual([])
  })

  it('a window with nothing in it has no products', async () => {
    const m = await getProductMetrics({ start: '2019-01-01', end: '2019-01-01' })
    expect(m.products).toEqual([])
    expect(m.shopConversion).toBeNull()
  })
})
