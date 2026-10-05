/**
 * The server-side `purchase` event against the real Postgres database (DATABASE_URL):
 * it is produced once per sale, only from a confirmed payment / confirmed order, with
 * values read from the stored order, and a failing destination never harms the payment.
 * Every row it creates is tagged with a run id and removed in afterAll.
 * Run with: npm run test:integration
 */
import 'dotenv/config'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Keep the run free of side effects outside the database rows we own.
vi.mock('@/lib/services/notification/notification.service', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/services/notification/store-order-email', () => ({
  sendNewOrderAlert: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/services/admin.service', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/services/marketplace/stock-sync.service', () => ({
  enqueueStockSyncForProducts: vi.fn().mockResolvedValue(undefined),
}))

vi.stubEnv('PAYTR_MERCHANT_ID', '')
vi.stubEnv('PAYTR_MERCHANT_KEY', '')
vi.stubEnv('PAYTR_MERCHANT_SALT', '')
vi.stubEnv('PAYMENT_PROVIDER', 'PAYTR')
vi.stubEnv('NODE_ENV', 'test')

const { db } = await import('@/prisma/db')
const { createOrder, findOrderByNumber } = await import('@/lib/services/orders.service')
const payments = await import('@/lib/services/payment/payment.service')
const { PayTRPaymentProvider } = await import('@/lib/services/payment/paytr.provider')
const { serverDispatcher } = await import('@/lib/marketing/server')
const { buildPurchaseEvent } = await import('@/lib/marketing/purchase')
import type { MarketingEvent } from '@/lib/marketing/events'

const RUN = `mkt${Date.now().toString(36)}`
let productId = ''
let userId = ''
const createdOrderIds: string[] = []

const address = {
  fullName: 'Test Müşteri',
  phone: '05551112233',
  addressLine: 'Test Mahallesi Deneme Sokak No 1',
  city: 'İstanbul',
  district: 'Kadıköy',
  postalCode: '34000',
  country: 'TR',
}

const simulator = new PayTRPaymentProvider()
const dispatchSpy = vi.spyOn(serverDispatcher, 'dispatch')

/** Every purchase that reached the destinations, with the throwing / recording test destination */
const received: MarketingEvent[] = []
let failNext = false
serverDispatcher.register({
  id: 'test-recorder',
  consent: 'none',
  accepts: (e) => e.eventName === 'purchase',
  send: (e) => {
    if (failNext) throw new Error('destination down')
    received.push(e)
  },
})

const purchasesDispatched = (orderNumber: string) =>
  dispatchSpy.mock.calls.filter(([e]) => e.eventName === 'purchase' && e.orderId === orderNumber)

async function newOrder(quantity = 1, marketing?: Parameters<typeof createOrder>[0]['marketing']) {
  const order = await createOrder({
    userId,
    items: [{ productId, quantity }],
    shippingAddress: address,
    email: `${RUN}@example.com`,
    marketing,
  })
  createdOrderIds.push(order.id)
  return order
}

async function startCardPayment(orderNumber: string) {
  await payments.initiatePayment({
    orderNumber,
    customer: { fullName: address.fullName, email: `${RUN}@example.com`, phone: address.phone },
    ipAddress: '127.0.0.1',
  })
}

async function callback(orderNumber: string, status: 'SUCCESS' | 'FAILED') {
  const order = await findOrderByNumber(orderNumber)
  const latest = await db.orm.public.Payment.where({ orderId: order!.id }).orderBy((p) => p.attemptNumber.desc()).first()
  const { payload, signature } = simulator.generateTestWebhook(latest!.merchantOid!, order!.totalAmount, status)
  return payments.handlePaymentWebhook(payload, signature)
}

beforeAll(async () => {
  const category = await db.orm.public.Category.select('id').first()
  if (!category) throw new Error('Integration tests need at least one category row.')
  const product = await db.orm.public.Product.create({
    name: `Pazarlama Test Ürün ${RUN}`,
    slug: `mkt-${RUN}`,
    sku: `MKT-${RUN}`,
    price: '100.00' as never,
    taxRate: '20.00' as never,
    stock: 50,
    isActive: true,
    categoryId: category.id,
  } as never)
  productId = product.id
  const user = await db.orm.public.User.create({
    email: `${RUN}@example.com`,
    name: 'Test Müşteri',
    role: 'CUSTOMER',
    status: 'ACTIVE',
  } as never)
  userId = user.id
}, 60_000)

beforeEach(() => {
  received.length = 0
  failNext = false
  dispatchSpy.mockClear()
})

afterAll(async () => {
  const run = (plan: Parameters<ReturnType<typeof db.runtime>['execute']>[0]) => db.runtime().execute(plan)
  if (userId) {
    await run(db.raw.sql`DELETE FROM coupon_usages WHERE user_id = ${userId}`.affectedCount().build())
    await run(db.raw.sql`DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE user_id = ${userId})`.affectedCount().build())
    await run(db.raw.sql`DELETE FROM orders WHERE user_id = ${userId}`.affectedCount().build())
  }
  if (productId) await run(db.raw.sql`DELETE FROM inventory_transactions WHERE product_id = ${productId}`.affectedCount().build())
  if (productId) await run(db.raw.sql`DELETE FROM products WHERE id = ${productId}`.affectedCount().build())
  if (userId) await run(db.raw.sql`DELETE FROM users WHERE id = ${userId}`.affectedCount().build())
  expect(createdOrderIds.length).toBeGreaterThan(0)
  await db.close()
}, 120_000)

describe('purchase from a confirmed card payment', () => {
  it('is produced once, from the stored order, and not by starting or failing a payment', async () => {
    const order = await newOrder(2)
    expect(purchasesDispatched(order.orderNumber)).toHaveLength(0) // order created: not a sale

    await startCardPayment(order.orderNumber)
    expect(purchasesDispatched(order.orderNumber)).toHaveLength(0) // payment started (PayTR iframe): not a sale

    const first = await callback(order.orderNumber, 'SUCCESS')
    expect(first.success).toBe(true)
    expect(purchasesDispatched(order.orderNumber)).toHaveLength(1)

    // Provider retries / duplicate webhook: the payment service's compare-and-set blocks a second one
    const second = await callback(order.orderNumber, 'SUCCESS')
    expect(second.message).toMatch(/zaten/)
    expect(purchasesDispatched(order.orderNumber)).toHaveLength(1)
    expect(received.filter((e) => e.orderId === order.orderNumber)).toHaveLength(1)

    // Values are the database's, not anything a client sent
    const stored = await findOrderByNumber(order.orderNumber)
    const event = received.find((e) => e.orderId === order.orderNumber)!
    expect(event.eventId).toBe(`purchase_${order.orderNumber}`)
    expect(event.source).toBe('server')
    expect(event.value).toBe(stored!.totalAmount)
    expect(event.currency).toBe('TRY')
    expect(event.userId).toBe(userId)
    expect(event.items).toHaveLength(1)
    expect(event.items![0]).toMatchObject({ productId, quantity: 2, price: 100 })
    expect(event).toEqual({ ...buildPurchaseEvent(stored!)!, timestamp: event.timestamp, source: 'server', consent: null })
  }, 60_000)

  it('is not produced for a failed payment', async () => {
    const order = await newOrder()
    await startCardPayment(order.orderNumber)
    const result = await callback(order.orderNumber, 'FAILED')
    expect(result.success).toBe(false)
    expect((await findOrderByNumber(order.orderNumber))!.status).toBe('PAYMENT_FAILED')
    expect(purchasesDispatched(order.orderNumber)).toHaveLength(0)
    expect(received).toHaveLength(0)
  }, 60_000)

  it('is not produced for an order that was only created', async () => {
    const order = await newOrder()
    expect(buildPurchaseEvent((await findOrderByNumber(order.orderNumber))!)).toBeNull()
  }, 60_000)
})

describe('marketing context saved with the order', () => {
  const campaign = { last: { utmSource: 'facebook', utmMedium: 'paid', utmCampaign: 'yaz', utmTerm: 'adset1', utmContent: 'ad7', fbclid: 'abc' }, first: { utmSource: 'google' } }

  it('stores consent, visitor id and campaign when the visitor accepted, and the server purchase carries them', async () => {
    const order = await newOrder(1, { consent: 'all', anonymousId: 'anon-test-1', attribution: campaign })
    expect(order.marketingConsent).toBe('all')
    expect(order.anonymousId).toBe('anon-test-1')
    expect(order.attribution).toEqual(campaign)

    await startCardPayment(order.orderNumber)
    await callback(order.orderNumber, 'SUCCESS')
    const event = received.find((e) => e.orderId === order.orderNumber)!
    expect(event.consent).toBe('all')
    expect(event.anonymousId).toBe('anon-test-1')
    expect(event).toMatchObject({ utmSource: 'facebook', utmCampaign: 'yaz', utmTerm: 'adset1', utmContent: 'ad7', fbclid: 'abc' })
  }, 60_000)

  it('keeps only the consent choice, no visitor id or campaign, when the visitor declined', async () => {
    const order = await newOrder(1, { consent: 'necessary', anonymousId: 'anon-test-2', attribution: campaign })
    expect(order.marketingConsent).toBe('necessary')
    expect(order.anonymousId).toBeNull()
    expect(order.attribution).toBeNull()

    await startCardPayment(order.orderNumber)
    await callback(order.orderNumber, 'SUCCESS')
    const event = received.find((e) => e.orderId === order.orderNumber)!
    expect(event.consent).toBe('necessary')
    expect('anonymousId' in event).toBe(false)
    expect('utmSource' in event).toBe(false)
  }, 60_000)

  it('treats an order with no marketing context as unknown consent, so consent-gated destinations skip it', async () => {
    const order = await newOrder(1)
    expect(order.marketingConsent).toBeNull()
    expect(order.anonymousId).toBeNull()
    expect(order.attribution).toBeNull()

    await startCardPayment(order.orderNumber)
    await callback(order.orderNumber, 'SUCCESS')
    expect(received.find((e) => e.orderId === order.orderNumber)!.consent).toBeNull()
  }, 60_000)
})

describe('a failing destination never harms the order', () => {
  it('still confirms the payment and the order when the purchase destination throws', async () => {
    const order = await newOrder()
    await startCardPayment(order.orderNumber)
    failNext = true
    const result = await callback(order.orderNumber, 'SUCCESS')
    expect(result.success).toBe(true)
    const stored = await findOrderByNumber(order.orderNumber)
    expect(stored!.status).toBe('CONFIRMED')
    expect(stored!.paidAt).not.toBeNull()
    expect(purchasesDispatched(order.orderNumber)).toHaveLength(1) // it was attempted
    expect(received).toHaveLength(0) // and the destination failed
  }, 60_000)
})

describe('purchase from the other payment methods', () => {
  it('kapıda ödeme: once, when the order is confirmed; a resubmit adds none', async () => {
    const order = await newOrder()
    await payments.initiateCashOnDelivery({ orderNumber: order.orderNumber, ipAddress: '127.0.0.1' })
    expect((await findOrderByNumber(order.orderNumber))!.status).toBe('CONFIRMED')
    expect(purchasesDispatched(order.orderNumber)).toHaveLength(1)
    expect(received[0]).toMatchObject({ orderId: order.orderNumber, paymentMethod: 'CASH_ON_DELIVERY' })

    await payments.initiateCashOnDelivery({ orderNumber: order.orderNumber, ipAddress: '127.0.0.1' })
    expect(purchasesDispatched(order.orderNumber)).toHaveLength(1)
  }, 60_000)

  it('havale/EFT: none when the transfer is announced, once when the shop confirms the money', async () => {
    const order = await newOrder()
    await payments.initiateBankTransfer({ orderNumber: order.orderNumber, ipAddress: '127.0.0.1' })
    expect(purchasesDispatched(order.orderNumber)).toHaveLength(0)

    await payments.confirmBankTransfer({ orderNumber: order.orderNumber, confirmedBy: 'test' })
    expect(purchasesDispatched(order.orderNumber)).toHaveLength(1)
    expect(received[0]).toMatchObject({ orderId: order.orderNumber, paymentMethod: 'BANK_TRANSFER' })

    await expect(payments.confirmBankTransfer({ orderNumber: order.orderNumber, confirmedBy: 'test' })).rejects.toThrow()
    expect(purchasesDispatched(order.orderNumber)).toHaveLength(1)
  }, 60_000)
})
