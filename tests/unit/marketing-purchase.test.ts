import { describe, expect, it } from 'vitest'
import { buildPurchaseEvent, isPurchaseEligible, type PurchaseOrderSource } from '@/lib/marketing/purchase'
import { purchaseEventId } from '@/lib/marketing/events'

function order(over: Partial<PurchaseOrderSource> = {}): PurchaseOrderSource {
  return {
    id: 'o1',
    orderNumber: 'ZUU-20260001',
    userId: 'u1',
    status: 'CONFIRMED',
    channel: 'DIRECT',
    paymentMethod: 'CARD',
    totalAmount: 449.99,
    shippingAmount: 50,
    couponCode: null,
    createdAt: '2026-10-05T10:00:00.000Z',
    items: [
      { productId: 'p1', variantId: 'v1', variantInfo: 'Siyah', productName: 'Vazo', sku: 'VZ-1', quantity: 2, unitPrice: 150 },
      { productId: 'p2', variantId: null, variantInfo: null, productName: 'Kupa', sku: 'KP-1', quantity: 1, unitPrice: 99.99 },
    ],
    ...over,
  }
}

describe('purchase eligibility: only a real sale is a purchase', () => {
  it.each(['PAYMENT_RECEIVED', 'CONFIRMED', 'PREPARING', 'IN_PRODUCTION', 'PACKING', 'SHIPPED', 'DELIVERED'])('%s is a sale', (status) => {
    expect(isPurchaseEligible({ status, channel: 'DIRECT' })).toBe(true)
  })

  it.each(['PAYMENT_PENDING', 'PAYMENT_FAILED', 'CANCELLED', 'RETURN_REQUESTED', 'RETURNED', 'PARTIALLY_REFUNDED'])('%s is not', (status) => {
    expect(isPurchaseEligible({ status, channel: 'DIRECT' })).toBe(false)
    expect(buildPurchaseEvent(order({ status }))).toBeNull()
  })

  it('leaves marketplace orders to their own channel', () => {
    expect(buildPurchaseEvent(order({ channel: 'TRENDYOL' }))).toBeNull()
    expect(buildPurchaseEvent(order({ channel: 'HEPSIBURADA' }))).toBeNull()
  })

  it('needs at least one item', () => {
    expect(buildPurchaseEvent(order({ items: [] }))).toBeNull()
  })
})

describe('purchase payload comes from the stored order', () => {
  it('uses the order number as order id and the deterministic event id', () => {
    const e = buildPurchaseEvent(order())!
    expect(e.eventName).toBe('purchase')
    expect(e.orderId).toBe('ZUU-20260001')
    expect(e.eventId).toBe(purchaseEventId('ZUU-20260001'))
  })

  it('reports what the customer paid, in TRY, with the shipping fee separate', () => {
    const e = buildPurchaseEvent(order())!
    expect(e.value).toBe(449.99)
    expect(e.currency).toBe('TRY')
    expect(e.shipping).toBe(50)
    expect(e.paymentMethod).toBe('CARD')
  })

  it('maps order items to database product and variant ids with quantity and unit price', () => {
    const e = buildPurchaseEvent(order())!
    expect(e.items).toEqual([
      { productId: 'p1', variantId: 'v1', productName: 'Vazo', sku: 'VZ-1', variantLabel: 'Siyah', quantity: 2, price: 150 },
      { productId: 'p2', variantId: null, productName: 'Kupa', sku: 'KP-1', variantLabel: null, quantity: 1, price: 99.99 },
    ])
  })

  it('carries the signed-in (or guest) user id of the order and the coupon', () => {
    const e = buildPurchaseEvent(order({ couponCode: 'YAZ10' }))!
    expect(e.userId).toBe('u1')
    expect(e.coupon).toBe('YAZ10')
  })

  it('carries the visitor id and the last campaign touch saved at checkout', () => {
    const e = buildPurchaseEvent(
      order({
        anonymousId: 'anon-1',
        attribution: { last: { utmSource: 'facebook', utmCampaign: 'yaz', utmTerm: 'adset1', utmContent: 'ad7', fbclid: 'abc' }, first: { utmSource: 'google' } },
      })
    )!
    expect(e.anonymousId).toBe('anon-1')
    expect(e).toMatchObject({ utmSource: 'facebook', utmCampaign: 'yaz', utmTerm: 'adset1', utmContent: 'ad7', fbclid: 'abc' })
  })

  it('has no campaign fields for an order without attribution', () => {
    const e = buildPurchaseEvent(order({ attribution: null, anonymousId: null }))!
    expect('utmSource' in e).toBe(false)
    expect('anonymousId' in e).toBe(false)
  })

  it('is identical for every build of the same order, so repeats share one id and one value', () => {
    const a = buildPurchaseEvent(order(), () => 1)!
    const b = buildPurchaseEvent(order(), () => 2)!
    expect({ ...a, timestamp: 0 }).toEqual({ ...b, timestamp: 0 })
  })
})
