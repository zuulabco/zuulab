/**
 * End-to-end checkout against the real Postgres database (DATABASE_URL).
 * Every row it creates is tagged with a run id and removed in afterAll.
 * Run with: npm run test:integration
 */
import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Keep the run free of side effects outside the database rows we own.
vi.mock('@/lib/services/notification/notification.service', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/services/admin.service', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/services/marketplace/stock-sync.service', () => ({
  enqueueStockSyncForProducts: vi.fn().mockResolvedValue(undefined),
}))

// Use the local PayTR simulator: no credentials, non-production.
vi.stubEnv('PAYTR_MERCHANT_ID', '')
vi.stubEnv('PAYTR_MERCHANT_KEY', '')
vi.stubEnv('PAYTR_MERCHANT_SALT', '')
vi.stubEnv('PAYMENT_PROVIDER', 'PAYTR')
vi.stubEnv('NODE_ENV', 'test')

const { db } = await import('@/prisma/db')
const { toDbTimestamp } = await import('@/lib/db/time')
const { quoteCart } = await import('@/lib/services/checkout/pricing.service')
const { createOrder, findOrderByNumber, updateOrderStatus, CheckoutError } = await import('@/lib/services/orders.service')
const payments = await import('@/lib/services/payment/payment.service')
const { PayTRPaymentProvider } = await import('@/lib/services/payment/paytr.provider')
const inventoryAdmin = await import('@/lib/services/inventory-admin.service')
const reviews = await import('@/lib/services/reviews.service')
const { loadSnapshot } = await import('@/lib/services/catalog/catalog.service')
const returns = await import('@/lib/services/returns/returns.service')

const RUN = `itest${Date.now().toString(36)}`
let productId = ''
let userId = ''
let couponId = ''
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

async function stock(): Promise<number> {
  const p = await db.orm.public.Product.select('stock').where({ id: productId }).first()
  return p!.stock
}

async function setStock(n: number) {
  await db.orm.public.Product.where({ id: productId }).update({ stock: n })
}

async function newOrder(extra: Partial<Parameters<typeof createOrder>[0]> = {}) {
  const order = await createOrder({
    userId,
    items: [{ productId, quantity: 1 }],
    shippingAddress: address,
    email: `${RUN}@example.com`,
    ...extra,
  })
  createdOrderIds.push(order.id)
  return order
}

const simulator = new PayTRPaymentProvider()

async function callback(orderNumber: string, status: 'SUCCESS' | 'FAILED', amount?: number, extra: Record<string, unknown> = {}) {
  const order = await findOrderByNumber(orderNumber)
  const latest = await db.orm.public.Payment
    .where({ orderId: order!.id })
    .orderBy((p) => p.attemptNumber.desc())
    .first()
  const { payload, signature } = simulator.generateTestWebhook(latest!.merchantOid!, amount ?? order!.totalAmount, status)
  return payments.handlePaymentWebhook({ ...payload, ...extra }, signature)
}

async function pay(orderNumber: string) {
  await payments.initiatePayment({
    orderNumber,
    customer: { fullName: address.fullName, email: `${RUN}@example.com`, phone: address.phone },
    ipAddress: '127.0.0.1',
  })
}

beforeAll(async () => {
  const category = await db.orm.public.Category.select('id').first()
  if (!category) throw new Error('Integration tests need at least one category row.')

  const product = await db.orm.public.Product.create({
    name: `Test Ürün ${RUN}`,
    slug: `test-${RUN}`,
    sku: `TEST-${RUN}`,
    price: '100.00' as never,
    taxRate: '20.00' as never,
    stock: 3,
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

afterAll(async () => {
  // Every order in this run belongs to the run's user, so cleanup keys on it.
  const run = (plan: Parameters<ReturnType<typeof db.runtime>["execute"]>[0]) => db.runtime().execute(plan)
  if (userId) {
    await run(db.raw.sql`DELETE FROM reviews WHERE user_id = ${userId}`.affectedCount().build())
    await run(db.raw.sql`DELETE FROM return_requests WHERE user_id = ${userId}`.affectedCount().build())
    await run(db.raw.sql`DELETE FROM coupon_usages WHERE user_id = ${userId}`.affectedCount().build())
    await run(db.raw.sql`DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE user_id = ${userId})`.affectedCount().build())
    await run(db.raw.sql`DELETE FROM orders WHERE user_id = ${userId}`.affectedCount().build())
  }
  if (productId) await run(db.raw.sql`DELETE FROM inventory_transactions WHERE product_id = ${productId}`.affectedCount().build())
  if (couponId) await run(db.raw.sql`DELETE FROM coupons WHERE id = ${couponId}`.affectedCount().build())
  if (productId) await run(db.raw.sql`DELETE FROM products WHERE id = ${productId}`.affectedCount().build())
  if (userId) await run(db.raw.sql`DELETE FROM users WHERE id = ${userId}`.affectedCount().build())
  expect(createdOrderIds.length).toBeGreaterThan(0)
  await db.close()
}, 120_000)

describe('pricing', () => {
  it('prices from the database with VAT included in the shelf price', async () => {
    const quote = await quoteCart({ items: [{ productId, quantity: 2 }] })
    expect(quote.subtotal).toBe(200)
    expect(quote.issues).toEqual([])
    // 200 incl. 20% VAT -> 33.33 VAT; plus VAT inside the shipping fee.
    expect(quote.taxAmount).toBeCloseTo(33.33 + quote.shippingAmount / 6, 1)
    expect(quote.total).toBe(200 + quote.shippingAmount)
  })

  it('reports, never silently trims, quantities above stock', async () => {
    const quote = await quoteCart({ items: [{ productId, quantity: 50 }] })
    expect(quote.issues[0]?.code).toBe('INSUFFICIENT_STOCK')
    expect(quote.lines[0]?.quantity).toBe(50)
  })
})

describe('stock holds', () => {
  it('never oversells under concurrent checkouts', async () => {
    await setStock(3)
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => newOrder()))
    const ok = results.filter((r) => r.status === 'fulfilled')
    expect(ok.length).toBe(3)
    expect(await stock()).toBe(0)
    for (const r of results) {
      if (r.status === 'rejected') expect(r.reason).toBeInstanceOf(CheckoutError)
    }
    // Put the stock back for the next tests.
    for (const r of ok) {
      if (r.status === 'fulfilled') await updateOrderStatus(r.value.orderNumber, 'CANCELLED', 'test cleanup')
    }
    expect(await stock()).toBe(3)
  }, 120_000)

  it('returns the same order for a resubmitted checkout key', async () => {
    await setStock(3)
    const key = `${RUN}-key-0001`
    const [a, b] = await Promise.all([newOrder({ checkoutKey: key }), newOrder({ checkoutKey: key })])
    expect(a.orderNumber).toBe(b.orderNumber)
    expect(await stock()).toBe(2)
    await updateOrderStatus(a.orderNumber, 'CANCELLED', 'test cleanup')
    expect(await stock()).toBe(3)
  }, 60_000)

  it('refuses checkout when the total the customer saw is stale', async () => {
    await setStock(3)
    await expect(newOrder({ expectedTotal: 1 })).rejects.toMatchObject({ code: 'PRICE_CHANGED' })
    expect(await stock()).toBe(3)
  }, 60_000)
})

describe('payment callbacks', () => {
  it('confirms once, keeps stock committed, and ignores duplicates', async () => {
    await setStock(3)
    const order = await newOrder()
    await pay(order.orderNumber)
    expect(await stock()).toBe(2)

    const first = await callback(order.orderNumber, 'SUCCESS')
    const second = await callback(order.orderNumber, 'SUCCESS')
    expect(first.success).toBe(true)
    expect(second.message).toMatch(/zaten/)

    const after = await findOrderByNumber(order.orderNumber)
    expect(after!.status).toBe('CONFIRMED')
    expect(after!.stockState).toBe('COMMITTED')
    expect(after!.paidAt).not.toBeNull()
    expect(await stock()).toBe(2)
  }, 60_000)

  it('accepts installment totals above the order total', async () => {
    await setStock(3)
    const order = await newOrder()
    await pay(order.orderNumber)
    const res = await callback(order.orderNumber, 'SUCCESS', order.totalAmount + 12.5, { installment_count: '3' })
    expect(res.success).toBe(true)
    const payment = await db.orm.public.Payment.where({ orderId: order.id }).first()
    expect(payment!.installmentCount).toBe(3)
    expect(Number(payment!.paidAmount)).toBeCloseTo(order.totalAmount + 12.5, 2)
  }, 60_000)

  it('releases stock exactly once on failure, then retry takes it again', async () => {
    await setStock(3)
    const order = await newOrder()
    await pay(order.orderNumber)
    expect(await stock()).toBe(2)

    await callback(order.orderNumber, 'FAILED')
    await callback(order.orderNumber, 'FAILED')
    expect((await findOrderByNumber(order.orderNumber))!.status).toBe('PAYMENT_FAILED')
    expect(await stock()).toBe(3)

    const retry = await payments.retryPayment({ orderNumber: order.orderNumber })
    expect(retry.attemptNumber).toBe(2)
    expect(await stock()).toBe(2)

    await callback(order.orderNumber, 'SUCCESS')
    expect((await findOrderByNumber(order.orderNumber))!.status).toBe('CONFIRMED')
    expect(await stock()).toBe(2)
  }, 60_000)

  it('expires abandoned payments and still honours a late success', async () => {
    await setStock(3)
    const order = await newOrder()
    await pay(order.orderNumber)
    await db.orm.public.Order.where({ id: order.id }).update({
      paymentExpiresAt: toDbTimestamp(new Date(Date.now() - 60_000)) as never,
    })

    const cleaned = await payments.cleanupExpiredReservations()
    expect(cleaned.expiredOrders).toContain(order.orderNumber)
    expect(await stock()).toBe(3)

    await callback(order.orderNumber, 'SUCCESS')
    const after = await findOrderByNumber(order.orderNumber)
    expect(after!.status).toBe('CONFIRMED')
    expect(after!.stockState).toBe('COMMITTED')
    expect(await stock()).toBe(2)
  }, 60_000)
})

describe('coupons', () => {
  it('applies DB coupons, counts use only when paid, and enforces limits', async () => {
    await setStock(3)
    const coupon = await db.orm.public.Coupon.create({
      code: RUN.toUpperCase(),
      type: 'PERCENTAGE',
      discountValue: '10.00' as never,
      maxUses: 1,
      maxUsesPerUser: 5,
      isActive: true,
    } as never)
    couponId = coupon.id

    const quote = await quoteCart({ items: [{ productId, quantity: 1 }], couponCode: coupon.code })
    expect(quote.discountAmount).toBe(10)

    const order = await newOrder({ couponCode: coupon.code })
    expect(order.discountAmount).toBe(10)
    let row = await db.orm.public.Coupon.where({ id: coupon.id }).first()
    expect(row!.currentUses).toBe(0)

    await pay(order.orderNumber)
    await callback(order.orderNumber, 'SUCCESS')
    await callback(order.orderNumber, 'SUCCESS')
    row = await db.orm.public.Coupon.where({ id: coupon.id }).first()
    expect(row!.currentUses).toBe(1)

    const exhausted = await quoteCart({ items: [{ productId, quantity: 1 }], couponCode: coupon.code })
    expect(exhausted.coupon).toBeNull()
    expect(exhausted.couponError).toMatch(/limit/)
  }, 60_000)
})

describe('admin stock adjustments', () => {
  it('adjusts relative to the locked current value, clamps at zero and logs the movement', async () => {
    await setStock(5)
    const up = await inventoryAdmin.adminAdjustStock({
      productId, quantityChange: 3, movementType: 'RESTOCK', reason: 'test restock', changedBy: 'test',
    })
    expect(up.newStock).toBe(8)

    // Concurrent adjustments must all apply (no lost updates).
    await Promise.all(Array.from({ length: 5 }, () => inventoryAdmin.adminAdjustStock({
      productId, quantityChange: -1, movementType: 'CORRECTION', reason: 'test concurrent', changedBy: 'test',
    })))
    expect(await stock()).toBe(3)

    const down = await inventoryAdmin.adminAdjustStock({
      productId, quantityChange: -50, movementType: 'CORRECTION', reason: 'test clamp', changedBy: 'test',
    })
    expect(down.newStock).toBe(0)

    const movements = await inventoryAdmin.adminGetInventoryMovements(productId)
    const manual = movements.filter((m) => m.reason.startsWith('test '))
    expect(manual.length).toBe(7)
    expect(movements[0].reason).toBe('test clamp')
    // The checkout tests above moved stock through orders; those moves are in the ledger too.
    expect(movements.some((m) => m.reason.startsWith('Sipariş için ayrıldı'))).toBe(true)
    expect(movements.some((m) => m.reason.startsWith('Stok geri alındı'))).toBe(true)
  }, 60_000)
})

describe('reviews', () => {
  it('requires a paid purchase, stays hidden until approved, then feeds the rating', async () => {
    const user = { id: userId, email: `${RUN}@example.com`, name: 'Test Müşteri' }
    // The earlier payment tests left this user with confirmed orders for the product.
    const review = await reviews.createProductReview(user, { productIdOrSlug: productId, rating: 4, body: 'Gayet güzel bir ürün' })
    expect(review.status).toBe('PENDING')
    expect((await reviews.getProductReviews(productId)).stats.totalCount).toBe(0)
    await expect(
      reviews.createProductReview(user, { productIdOrSlug: productId, rating: 5, body: 'İkinci yorum denemesi' })
    ).rejects.toThrow(/DUPLICATE_REVIEW/)

    await reviews.moderateReview('admin', review.id, 'APPROVE')
    const publicView = await reviews.getProductReviews(productId)
    expect(publicView.stats.totalCount).toBe(1)
    expect(publicView.reviews[0].userName).toBe('Test M.')
    expect(publicView.reviews[0].userEmail).toBe('')

    const snapshot = await loadSnapshot()
    const p = snapshot.products.find((x) => x.id === productId)
    expect(p?.reviewCount).toBe(1)
    expect(p?.rating).toBe(4)
  }, 60_000)
})

describe('returns and refunds', () => {
  it('runs a return end to end: restock once, refund through PayTR, never refund more than paid', async () => {
    await setStock(5)
    const order = await newOrder()
    await pay(order.orderNumber)
    await callback(order.orderNumber, 'SUCCESS')
    for (const status of ['PREPARING', 'SHIPPED', 'DELIVERED']) {
      expect((await updateOrderStatus(order.orderNumber, status, 'test')).success).toBe(true)
    }
    expect(await stock()).toBe(4)

    const paidOrder = await findOrderByNumber(order.orderNumber)
    const ret = await returns.createReturnRequest({
      orderNumber: order.orderNumber,
      userId,
      type: 'RETURN',
      reason: 'EXPECTATION_NOT_MET',
      items: [{ orderItemId: paidOrder!.items[0].id, productId, quantity: 1 }],
    })
    expect(ret.status).toBe('REQUESTED')
    expect(ret.refundAmount).toBe(100)
    expect((await findOrderByNumber(order.orderNumber))!.status).toBe('RETURN_REQUESTED')

    // A second request for the same order is refused while one is open.
    await expect(returns.createReturnRequest({
      orderNumber: order.orderNumber, userId, type: 'RETURN', reason: 'OTHER',
      items: [{ productId, quantity: 1 }],
    })).rejects.toThrow(/devam eden/)

    await returns.approveReturnRequest({ returnNumber: ret.returnNumber, adminUserId: 'admin' })
    await returns.receiveReturnPackage({ returnNumber: ret.returnNumber, adminUserId: 'admin' })
    expect((await findOrderByNumber(order.orderNumber))!.status).toBe('RETURNED')

    const item = (await returns.getReturnRequestByNumber(ret.returnNumber))!.items[0]
    const resolutions = [{ itemId: item.id, condition: 'UNUSED', inspectionResult: 'OK', resolution: 'RESTOCK' as const }]
    await returns.inspectReturnItems({ returnNumber: ret.returnNumber, itemResolutions: resolutions })
    expect(await stock()).toBe(5)
    // Inspecting again does not restock twice.
    await returns.inspectReturnItems({ returnNumber: ret.returnNumber, itemResolutions: resolutions })
    expect(await stock()).toBe(5)

    const refunded = await returns.processRefundForReturn({ returnNumber: ret.returnNumber, adminUserId: 'admin' })
    expect(refunded.status).toBe('COMPLETED')
    expect(refunded.refundStatus).toBe('COMPLETED')
    expect((await findOrderByNumber(order.orderNumber))!.status).toBe('PARTIALLY_REFUNDED')
    const again = await returns.processRefundForReturn({ returnNumber: ret.returnNumber })
    expect(again.refundRef).toBe(refunded.refundRef)

    // A forged second return worth more than the remaining paid amount is refused.
    const raw = await db.orm.public.ReturnRequest.where({ returnNumber: ret.returnNumber }).first()
    const forged = await db.orm.public.ReturnRequest.create({
      returnNumber: `${ret.returnNumber}X`, orderId: raw!.orderId, userId, type: 'RETURN' as never,
      status: 'INSPECTED', reason: 'test', photoUrls: [], refundAmount: '9999.00' as never, refundStatus: 'PENDING',
    })
    // The payment is now fully refunded, so it is refused either as exceeding the paid
    // amount or as having no refundable payment left.
    await expect(returns.processRefundForReturn({ returnNumber: forged.returnNumber })).rejects.toThrow(/aşıyor|iade edilebilecek/)
  }, 120_000)
})
