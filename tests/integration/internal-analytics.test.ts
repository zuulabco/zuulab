/**
 * ZUULAB's own analytics against the real Postgres database (DATABASE_URL): the SQL behind
 * visitors, funnel, conversion, abandonment, revenue, products and sources.
 *
 * Everything lives in a window of March 2019, where the shop has no real data, so the
 * numbers can be asserted exactly. Rows are tagged with a run id and removed in afterAll;
 * no product is created (an existing one is only referenced), so nothing shows on the shop.
 * Run with: npm run test:integration
 */
import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { db } = await import('@/prisma/db')
const { toDbTimestamp } = await import('@/lib/db/time')
const { storeEvent, getInternalMetrics } = await import('@/lib/services/analytics/internal-analytics.service')

const RUN = `zt${Date.now().toString(36)}`
const RANGE = { start: '2019-03-10', end: '2019-03-11' }
const run = (plan: Parameters<ReturnType<typeof db.runtime>['execute']>[0]) => db.runtime().execute(plan)

let productId = ''
let productName = ''
let userId = ''
let seq = 0

const at = (iso: string) => new Date(iso)

async function event(name: string, anon: string, over: Partial<Parameters<typeof storeEvent>[0]> = {}) {
  await storeEvent({
    eventId: `${RUN}-${++seq}`,
    name,
    occurredAt: at('2019-03-10T09:00:00Z'),
    anonymousId: anon,
    sessionId: `s-${anon}`,
    productId: null,
    value: null,
    pagePath: '/',
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmContent: null,
    ...over,
  })
}

interface OrderSpec {
  status: string
  channel?: string
  total: number
  shipping: number
  consent: 'all' | 'necessary' | null
  anon: string | null
  attribution?: object
  at: string
  qty: number
}

async function order(n: number, o: OrderSpec) {
  const created = await (db.orm.public.Order as any).create({
    orderNumber: `ZT-${RUN}-${n}`,
    userId,
    status: o.status,
    subtotal: (o.total - o.shipping).toFixed(2),
    shippingCost: o.shipping.toFixed(2),
    total: o.total.toFixed(2),
    shipToName: 'T',
    shipToPhone: '0',
    shipToAddress: 'T',
    shipToCity: 'T',
    shipToDistrict: 'T',
    shipToPostal: '1',
    channel: o.channel ?? 'DIRECT',
    marketingConsent: o.consent,
    anonymousId: o.anon,
    attribution: o.attribution ?? null,
    createdAt: toDbTimestamp(at(o.at)),
  })
  await (db.orm.public.OrderItem as any).create({
    orderId: created.id,
    productId,
    productName,
    sku: 'ZT',
    quantity: o.qty,
    unitPrice: ((o.total - o.shipping) / o.qty).toFixed(2),
    taxRate: '20.00',
    total: (o.total - o.shipping).toFixed(2),
  })
}

beforeAll(async () => {
  const product = await db.orm.public.Product.select('id', 'name').first()
  if (!product) throw new Error('Integration tests need at least one product row.')
  productId = product.id
  productName = product.name
  userId = (await db.orm.public.User.create({ email: `${RUN}@example.com`, name: 'T', role: 'CUSTOMER', status: 'ACTIVE' } as never)).id

  const utm = { utmSource: `${RUN}_meta`, utmMedium: 'paid_social', utmCampaign: 'camp1' }
  // A: sees, adds, starts checkout, enters payment info, buys
  await event('page_view', 'A', utm)
  await event('product_view', 'A', { productId, ...utm })
  await event('add_to_cart', 'A', { productId, value: 250 })
  await event('begin_checkout', 'A', { value: 250 })
  await event('add_payment_info', 'A', { value: 250 })
  // B: sees, adds, starts checkout, leaves
  await event('product_view', 'B', { productId })
  await event('add_to_cart', 'B', { productId, value: 250 })
  await event('begin_checkout', 'B', { value: 250 })
  // C: sees only, came from the campaign; D: lands and leaves
  await event('product_view', 'C', { productId, ...utm })
  await event('page_view', 'D')

  await order(1, { status: 'CONFIRMED', total: 300, shipping: 50, consent: 'all', anon: 'A', at: '2019-03-11T09:00:00Z', qty: 2, attribution: { last: utm } })
  await order(2, { status: 'DELIVERED', total: 100, shipping: 0, consent: 'necessary', anon: null, at: '2019-03-11T10:00:00Z', qty: 1 })
  await order(3, { status: 'CANCELLED', total: 999, shipping: 0, consent: 'all', anon: 'B', at: '2019-03-11T11:00:00Z', qty: 1 })
  await order(4, { status: 'CONFIRMED', channel: 'TRENDYOL', total: 777, shipping: 0, consent: null, anon: null, at: '2019-03-11T12:00:00Z', qty: 1 })
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

describe('internal analytics against the database', () => {
  it('counts visitors, funnel steps, orders, revenue and rates exactly', async () => {
    const m = await getInternalMetrics(RANGE)
    expect(m.visitors).toBe(4)
    expect(m.sessions).toBe(4)
    expect(m.funnel.map((s) => [s.key, s.visitors])).toEqual([
      ['visitors', 4],
      ['productViewers', 3],
      ['cartAdders', 2],
      ['checkoutStarters', 2],
      ['paymentStarters', 1],
      ['buyers', 1],
    ])
    // sold, storefront orders only: cancelled and marketplace ones are left out
    expect(m.orders).toBe(2)
    expect(m.revenue).toBe(400)
    expect(m.shipping).toBe(50)
    expect(m.averageOrderValue).toBe(200)
    expect(m.conversionRate).toBeCloseTo(1 / 4)
    expect(m.cartAbandonmentRate).toBeCloseTo(0.5)
    expect(m.checkoutAbandonmentRate).toBeCloseTo(0.5)
    // one of the two sold orders belongs to a consented visitor
    expect(m.trackedOrderShare).toBeCloseTo(0.5)
    expect(m.productViews).toBe(3)
    expect(m.addToCarts).toBe(2)
  })

  it('reports each day of the span, in Turkish days', async () => {
    const m = await getInternalMetrics(RANGE)
    expect(m.days).toEqual([
      { day: '2019-03-10', visitors: 4, orders: 0, revenue: 0 },
      { day: '2019-03-11', visitors: 0, orders: 2, revenue: 400 },
    ])
  })

  it('per product: views and carts from events, sales from orders, conversion between consented visitors', async () => {
    const m = await getInternalMetrics(RANGE)
    const p = m.products.find((x) => x.productId === productId)!
    expect(p).toMatchObject({ viewers: 3, cartAdders: 2, buyers: 1, units: 3, revenue: 350 })
    expect(p.conversionRate).toBeCloseTo(1 / 3)
  })

  it('sources: visitors from events, orders and revenue from the last campaign touch of the order', async () => {
    const m = await getInternalMetrics(RANGE)
    const s = m.sources.find((x) => x.source === `${RUN}_meta`)!
    expect(s).toMatchObject({ medium: 'paid_social', campaign: 'camp1', visitors: 2, orders: 1, revenue: 300 })
  })

  it('a repeated event id is stored once', async () => {
    const id = `${RUN}-dup`
    const row = {
      eventId: id,
      name: 'page_view',
      occurredAt: at('2019-03-10T10:00:00Z'),
      anonymousId: 'E',
      sessionId: 's-E',
      productId: null,
      value: null,
      pagePath: '/',
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmContent: null,
    }
    await storeEvent(row)
    await storeEvent(row)
    const m = await getInternalMetrics(RANGE)
    expect(m.visitors).toBe(5) // A to D plus E, once
    const rows = (await db
      .runtime()
      .query(db.raw.sql`SELECT COUNT(*)::int AS n FROM marketing_events WHERE event_id = ${id}`.returnsRow({ n: 'pg/int4@1' } as never).build() as never)) as unknown as Array<{ n: number }>
    expect(rows[0].n).toBe(1)
  })

  it('a window with nothing in it gives zeros and null rates, not made-up numbers', async () => {
    const m = await getInternalMetrics({ start: '2019-01-01', end: '2019-01-01' })
    expect(m).toMatchObject({ visitors: 0, orders: 0, revenue: 0, conversionRate: null, cartAbandonmentRate: null, averageOrderValue: null })
  })
})
