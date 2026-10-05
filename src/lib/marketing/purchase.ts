import {
  purchaseEventId,
  roundMoney,
  type MarketingEvent,
  type MarketingItem,
  type PaymentMethodName,
} from './events'

/**
 * The `purchase` event is built from the order row in the database and from nothing
 * the browser says: ids, quantities, prices and the total all come from `orders` and
 * `order_items`. This file is pure (no database access) so the rules can be tested;
 * server.ts loads the order and calls it.
 */

/** The parts of a stored order a purchase needs (structurally compatible with StoredOrder) */
export interface PurchaseOrderSource {
  id: string
  orderNumber: string
  userId: string
  status: string
  channel: string
  paymentMethod: PaymentMethodName
  totalAmount: number
  shippingAmount: number
  couponCode: string | null
  createdAt: string
  items: Array<{
    productId: string
    variantId: string | null
    variantInfo: string | null
    productName: string
    sku: string
    quantity: number
    unitPrice: number
  }>
}

/**
 * Statuses in which the shop has really made the sale: the card or havale payment is
 * confirmed, or a kapıda ödeme order is confirmed for shipping (the customer pays the
 * courier; the order is committed, stock is taken). Everything before (PAYMENT_PENDING,
 * a failed or abandoned payment) and after a loss (CANCELLED, returns) is not a purchase.
 */
const SOLD_STATUSES = new Set([
  'PAYMENT_RECEIVED',
  'CONFIRMED',
  'PREPARING',
  'IN_PRODUCTION',
  'PACKING',
  'SHIPPED',
  'DELIVERED',
])

/** Only the shop's own storefront orders; Trendyol / Hepsiburada orders are reported by those channels */
export function isPurchaseEligible(order: Pick<PurchaseOrderSource, 'status' | 'channel'>): boolean {
  return order.channel === 'DIRECT' && SOLD_STATUSES.has(order.status)
}

/** The canonical purchase for an order, or null when the order is not (yet) a sale */
export function buildPurchaseEvent(
  order: PurchaseOrderSource,
  now: () => number = Date.now
): Omit<MarketingEvent, 'source' | 'consent'> | null {
  if (!isPurchaseEligible(order) || order.items.length === 0) return null

  const items: MarketingItem[] = order.items.map((i) => ({
    productId: i.productId,
    variantId: i.variantId,
    productName: i.productName,
    sku: i.sku,
    variantLabel: i.variantInfo,
    quantity: i.quantity,
    price: i.unitPrice,
  }))

  return {
    eventId: purchaseEventId(order.orderNumber),
    eventName: 'purchase',
    timestamp: now(),
    orderId: order.orderNumber,
    userId: order.userId,
    currency: 'TRY',
    value: roundMoney(order.totalAmount),
    items,
    paymentMethod: order.paymentMethod,
    ...(order.shippingAmount > 0 ? { shipping: roundMoney(order.shippingAmount) } : {}),
    ...(order.couponCode ? { coupon: order.couponCode } : {}),
  }
}
