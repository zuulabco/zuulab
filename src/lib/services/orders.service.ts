import 'server-only'
import crypto from 'crypto'
import { or } from '@prisma/orm-postgres/orm-client'
import { db } from '@/prisma/db'
import { round2 } from '@/lib/pricing/money'
import { dbTimestampToIso, toDbTimestamp } from '@/lib/db/time'
import { dbNumeric } from '@/lib/db/numeric'
import { refreshCatalogStock } from '@/lib/cache/catalog-cache'
import { logAuditEvent } from './admin.service'
import { createNotification } from './notification/notification.service'
import type { NotificationEventType } from './notification/notification.interface'
import { quoteCart, type CartIssue, type CartQuote } from './checkout/pricing.service'
import {
  InsufficientStockError,
  currentStockFor,
  holdStockForNewOrder,
  releaseOrderStock,
} from './checkout/stock.service'

/** How long a new order holds stock while the customer pays (PayTR session is 30 min). */
export const PAYMENT_HOLD_MINUTES = 35

export interface CreateOrderPayload {
  userId: string
  items: Array<{ productId: string; variantId?: string | null; quantity: number }>
  couponCode?: string | null
  shippingMethod?: 'STANDARD' | 'EXPRESS'
  shippingAddress: {
    fullName: string
    phone: string
    addressLine: string
    city: string
    district: string
    postalCode: string
    country?: string
    email?: string
  }
  billingSameAsShipping?: boolean
  billingAddress?: {
    fullName: string
    phone: string
    addressLine: string
    city: string
    district: string
    postalCode: string
    country?: string
    companyName?: string
    taxOffice?: string
    taxNumber?: string
  }
  addressId?: string | null
  customerNote?: string
  email?: string
  /** Browser-generated id of this checkout attempt; a resubmit returns the same order. */
  checkoutKey?: string
  /** Total the customer was shown; checkout is refused if the server total differs. */
  expectedTotal?: number
}

export interface OrderStatusHistoryItem {
  id: string
  status: string
  note?: string | null
  createdAt: string
  createdBy?: string | null
}

export interface StoredOrder {
  id: string
  orderNumber: string
  userId: string
  status: string
  paymentStatus: string
  fulfillmentStatus: string
  stockState: string
  channel: string
  subtotal: number
  discountAmount: number
  shippingAmount: number
  shippingMethod: 'STANDARD' | 'EXPRESS'
  taxAmount: number
  totalAmount: number
  couponCode: string | null
  customerEmail?: string
  shippingAddressSnapshot: CreateOrderPayload['shippingAddress']
  billingAddressSnapshot?: CreateOrderPayload['billingAddress']
  customerNote: string | null
  addressId?: string | null
  paymentExpiresAt: string | null
  paidAt: string | null
  createdAt: string
  updatedAt: string
  statusHistory: OrderStatusHistoryItem[]
  items: Array<{
    id: string
    productId: string
    variantId: string | null
    variantInfo: string | null
    productName: string
    sku: string
    quantity: number
    unitPrice: number
    totalAmount: number
    taxRate: number
    imageUrl: string | null
  }>
}

export class CheckoutError extends Error {
  constructor(
    public code: 'CART_INVALID' | 'COUPON_INVALID' | 'PRICE_CHANGED' | 'OUT_OF_STOCK' | 'EMPTY_CART',
    message: string,
    public details?: { issues?: CartIssue[]; quote?: CartQuote }
  ) {
    super(message)
    this.name = 'CheckoutError'
  }
}

export const VALID_ORDER_TRANSITIONS: Record<string, string[]> = {
  PAYMENT_PENDING: ['PAYMENT_RECEIVED', 'CONFIRMED', 'PAYMENT_FAILED', 'CANCELLED'],
  PAYMENT_FAILED: ['PAYMENT_PENDING', 'CONFIRMED', 'CANCELLED'],
  PAYMENT_RECEIVED: ['CONFIRMED', 'PREPARING', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'IN_PRODUCTION', 'CANCELLED'],
  PREPARING: ['IN_PRODUCTION', 'PACKING', 'SHIPPED', 'CANCELLED'],
  IN_PRODUCTION: ['PACKING', 'SHIPPED', 'CANCELLED'],
  PACKING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'RETURN_REQUESTED'],
  DELIVERED: ['RETURN_REQUESTED'],
  RETURN_REQUESTED: ['RETURNED', 'DELIVERED'],
  RETURNED: ['PARTIALLY_REFUNDED'],
  CANCELLED: [],
}

const PAID_STATUSES = new Set([
  'PAYMENT_RECEIVED', 'CONFIRMED', 'PREPARING', 'IN_PRODUCTION', 'PACKING',
  'SHIPPED', 'DELIVERED', 'RETURN_REQUESTED', 'RETURNED', 'PARTIALLY_REFUNDED',
])

function derivePaymentStatus(status: string, paidAt: unknown): string {
  if (status === 'PAYMENT_PENDING') return 'PENDING'
  if (status === 'PAYMENT_FAILED') return 'FAILED'
  if (status === 'CANCELLED') return paidAt ? 'REFUND_PENDING' : 'CANCELLED'
  if (status === 'RETURNED' || status === 'PARTIALLY_REFUNDED') return 'REFUNDED'
  return PAID_STATUSES.has(status) ? 'PAID' : 'PENDING'
}

function deriveFulfillmentStatus(status: string): string {
  switch (status) {
    case 'SHIPPED': return 'SHIPPED'
    case 'DELIVERED': return 'DELIVERED'
    case 'CANCELLED': return 'CANCELLED'
    case 'RETURN_REQUESTED':
    case 'RETURNED':
    case 'PARTIALLY_REFUNDED': return 'RETURNED'
    default: return 'UNFULFILLED'
  }
}

/** ZUU + 12 digits from a CSPRNG; uniqueness is enforced by the DB index. */
function generateOrderNumber(): string {
  const digits = crypto.randomInt(0, 1_000_000_000_000).toString().padStart(12, '0')
  return `ZUU${digits}`
}

function isUniqueViolation(err: unknown, column: string): boolean {
  const text = String((err as { message?: string })?.message ?? err) + JSON.stringify(err ?? {})
  return /unique|duplicate key|23505/i.test(text) && text.includes(column)
}

// ─────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────

function withRelations() {
  return db.orm.public.Order
    .include('items')
    .include('statusHistory', (h) => h.orderBy((x) => x.createdAt.desc()))
    .include('user', (u) => u.select('id', 'email'))
}

type OrderRow = Awaited<ReturnType<ReturnType<typeof withRelations>['all']>>[number]

function toStoredOrder(row: OrderRow): StoredOrder {
  const billing = (row.billingSnapshot ?? undefined) as StoredOrder['billingAddressSnapshot']
  const email = row.email || row.user?.email || undefined
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    userId: row.userId,
    status: row.status,
    paymentStatus: derivePaymentStatus(row.status, row.paidAt),
    fulfillmentStatus: deriveFulfillmentStatus(row.status),
    stockState: row.stockState,
    channel: row.channel || 'DIRECT',
    subtotal: Number(row.subtotal),
    discountAmount: Number(row.discountAmount),
    shippingAmount: Number(row.shippingCost),
    shippingMethod: row.shippingMethod === 'EXPRESS' ? 'EXPRESS' : 'STANDARD',
    taxAmount: Number(row.taxAmount),
    totalAmount: Number(row.total),
    couponCode: row.couponCode ?? null,
    customerEmail: email,
    shippingAddressSnapshot: {
      fullName: row.shipToName,
      phone: row.shipToPhone,
      addressLine: row.shipToAddress,
      city: row.shipToCity,
      district: row.shipToDistrict,
      postalCode: row.shipToPostal,
      country: row.shipToCountry,
      email,
    },
    billingAddressSnapshot: billing,
    customerNote: row.customerNote ?? null,
    addressId: row.addressId ?? null,
    paymentExpiresAt: dbTimestampToIso(row.paymentExpiresAt),
    paidAt: dbTimestampToIso(row.paidAt),
    createdAt: dbTimestampToIso(row.createdAt) ?? new Date(0).toISOString(),
    updatedAt: dbTimestampToIso(row.updatedAt) ?? new Date(0).toISOString(),
    statusHistory: (row.statusHistory ?? []).map((h) => ({
      id: h.id,
      status: h.status,
      note: h.note ?? null,
      createdAt: dbTimestampToIso(h.createdAt) ?? '',
      createdBy: h.createdBy ?? null,
    })),
    items: (row.items ?? []).map((i) => ({
      id: i.id,
      productId: i.productId,
      variantId: i.variantId ?? null,
      variantInfo: i.variantInfo ?? null,
      productName: i.productName,
      sku: i.sku,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      totalAmount: Number(i.total),
      taxRate: Number(i.taxRate),
      imageUrl: i.imageUrl ?? null,
    })),
  }
}

export async function findOrderByNumber(orderNumber: string): Promise<StoredOrder | null> {
  const row = await withRelations().where({ orderNumber }).first()
  return row ? toStoredOrder(row) : null
}

const INTERNAL_NOTE_AUTHOR_PREFIX = 'internal-note:'

/** Staff-only history rows (internal notes) must never reach the customer. */
export function isInternalHistoryItem(item: { createdBy?: string | null }): boolean {
  return Boolean(item.createdBy?.startsWith(INTERNAL_NOTE_AUTHOR_PREFIX))
}

/**
 * Retrieves orders for a specific user (customer-facing: internal notes removed)
 */
export async function getUserOrders(userId: string): Promise<StoredOrder[]> {
  const rows = await withRelations()
    .where({ userId })
    .orderBy((o) => o.createdAt.desc())
    .limit(100)
    .all()
  return rows.map(toStoredOrder).map((o) => ({
    ...o,
    statusHistory: o.statusHistory.filter((h) => !isInternalHistoryItem(h)),
  }))
}

/** Adds a staff-only note to the order timeline. */
export async function addInternalOrderNote(orderNumber: string, note: string, adminEmail: string): Promise<OrderStatusHistoryItem | null> {
  const order = await db.orm.public.Order.select('id', 'status').where({ orderNumber }).first()
  if (!order) return null
  const row = await db.orm.public.OrderStatusHistory.create({
    orderId: order.id,
    status: order.status,
    note: `[Dahili Not] ${note}`,
    createdBy: `${INTERNAL_NOTE_AUTHOR_PREFIX}admin:${adminEmail}`,
  })
  return {
    id: row.id,
    status: row.status,
    note: row.note ?? null,
    createdAt: dbTimestampToIso(row.createdAt) ?? new Date().toISOString(),
    createdBy: row.createdBy ?? null,
  }
}

/**
 * Retrieves an order by order number with strict ownership authorization
 */
export async function getOrderByNumber(
  orderNumber: string,
  userId?: string,
  isAdmin = false
  // Callers read admin-only extras (currentStock, …) without a shared type yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any | null> {
  const found = await findOrderByNumber(orderNumber)
  if (!found) return null

  // Security check: non-admin can only view their own order
  if (!isAdmin && userId && found.userId !== userId) {
    return null
  }

  if (isAdmin) {
    const stockOf = await currentStockFor(found.items)
    return {
      ...found,
      items: found.items.map((item) => {
        const stock = stockOf(item)
        return {
          ...item,
          currentStock: stock,
          availableStock: stock,
          hasStockShortage: stock < 0,
        }
      }),
    }
  }

  return found
}

const PAYMENT_STATUS_FILTER: Record<string, string[]> = {
  PENDING: ['PAYMENT_PENDING'],
  FAILED: ['PAYMENT_FAILED'],
  PAID: [...PAID_STATUSES].filter((s) => s !== 'RETURNED' && s !== 'PARTIALLY_REFUNDED'),
  SUCCEEDED: [...PAID_STATUSES],
  REFUNDED: ['RETURNED', 'PARTIALLY_REFUNDED'],
  CANCELLED: ['CANCELLED'],
}

/**
 * Retrieves all orders for the admin panel with optional filters
 */
export async function getAllOrders(filters?: {
  status?: string
  paymentStatus?: string
  search?: string
  channel?: string
  limit?: number
}): Promise<StoredOrder[]> {
  let query = withRelations()

  if (filters?.channel && filters.channel !== 'ALL') {
    const channel = filters.channel
    query = query.where((o) => o.channel.eq(channel))
  }
  if (filters?.status && filters.status !== 'ALL') {
    const status = filters.status
    query = query.where((o) => o.status.eq(status as never))
  }
  if (filters?.paymentStatus && filters.paymentStatus !== 'ALL') {
    const statuses = PAYMENT_STATUS_FILTER[filters.paymentStatus] ?? []
    query = query.where((o) => o.status.in(statuses as never[]))
  }
  if (filters?.search && filters.search.trim()) {
    const q = `%${filters.search.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`
    query = query.where((o) => or(o.orderNumber.ilike(q), o.shipToName.ilike(q), o.email.ilike(q)))
  }

  const rows = await query
    .orderBy((o) => o.createdAt.desc())
    .limit(Math.min(filters?.limit ?? 500, 2000))
    .all()
  return rows.map(toStoredOrder)
}

// ─────────────────────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────────────────────

/**
 * Creates an order from a server-side quote and holds its stock, atomically.
 *
 * - Prices, discount, shipping and VAT come from `quoteCart`, never from the client.
 * - The cart must be fulfillable as-is; nothing is silently dropped or reduced.
 * - If `expectedTotal` differs from the server total the order is refused, so the
 *   customer is never charged an amount they were not shown.
 * - `checkoutKey` makes a resubmitted checkout return the original order.
 */
export async function createOrder(payload: CreateOrderPayload): Promise<StoredOrder> {
  const {
    userId,
    items,
    couponCode,
    shippingMethod = 'STANDARD',
    shippingAddress,
    billingSameAsShipping = true,
    billingAddress,
    addressId,
    customerNote,
    checkoutKey,
    expectedTotal,
  } = payload
  const email = (payload.email || shippingAddress.email || '').trim().toLowerCase() || null

  if (checkoutKey) {
    const existing = await withRelations().where({ checkoutKey }).first()
    if (existing) {
      if (existing.userId !== userId) {
        throw new CheckoutError('CART_INVALID', 'Geçersiz ödeme isteği. Lütfen sayfayı yenileyin.')
      }
      return toStoredOrder(existing)
    }
  }

  const quote = await quoteCart({ items, couponCode, shippingMethod, userId })

  if (quote.lines.length === 0) {
    throw new CheckoutError('EMPTY_CART', 'Sipariş oluşturmak için sepetinizde geçerli ürün bulunamadı.', { quote })
  }
  if (quote.issues.length > 0) {
    throw new CheckoutError('CART_INVALID', quote.issues[0].message, { issues: quote.issues, quote })
  }
  if (couponCode && couponCode.trim() && !quote.coupon) {
    throw new CheckoutError('COUPON_INVALID', quote.couponError || 'Kupon kodu geçersiz.', { quote })
  }
  if (expectedTotal !== undefined && Math.abs(round2(expectedTotal) - quote.total) > 0.009) {
    throw new CheckoutError(
      'PRICE_CHANGED',
      'Sepet tutarı güncellendi. Lütfen yeni tutarı kontrol edip tekrar deneyin.',
      { quote }
    )
  }

  const billing = billingSameAsShipping ? shippingAddress : billingAddress
  const expiresAt = new Date(Date.now() + PAYMENT_HOLD_MINUTES * 60 * 1000)

  let orderNumber = ''
  for (let attempt = 0; ; attempt++) {
    orderNumber = generateOrderNumber()
    try {
      await db.transaction(async (tx) => {
        const order = await tx.orm.public.Order.create({
          orderNumber,
          userId,
          addressId: addressId || null,
          status: 'PAYMENT_PENDING',
          subtotal: dbNumeric(quote.subtotal),
          discountAmount: dbNumeric(quote.discountAmount),
          shippingCost: dbNumeric(quote.shippingAmount),
          taxAmount: dbNumeric(quote.taxAmount),
          total: dbNumeric(quote.total),
          shipToName: shippingAddress.fullName,
          shipToPhone: shippingAddress.phone,
          shipToAddress: shippingAddress.addressLine,
          shipToCity: shippingAddress.city,
          shipToDistrict: shippingAddress.district,
          shipToPostal: shippingAddress.postalCode,
          shipToCountry: shippingAddress.country || 'TR',
          couponId: quote.coupon?.id ?? null,
          campaignId: quote.campaign?.id ?? null,
          campaignDiscount: dbNumeric(quote.campaignDiscount),
          couponCode: quote.coupon?.code ?? null,
          customerNote: customerNote || null,
          email,
          shippingMethod: quote.shippingMethod,
          billingSnapshot: (billing ?? null) as never,
          channel: 'DIRECT',
          checkoutKey: checkoutKey ?? null,
          stockState: 'NONE',
          paymentExpiresAt: toDbTimestamp(expiresAt) as never,
        })

        for (const line of quote.lines) {
          await tx.orm.public.OrderItem.create({
            orderId: order.id,
            productId: line.productId,
            variantId: line.variantId,
            productName: line.name,
            variantInfo: line.variantInfo,
            sku: line.sku,
            quantity: line.quantity,
            unitPrice: dbNumeric(line.unitPrice),
            taxRate: dbNumeric(line.taxRate),
            total: dbNumeric(line.lineTotal),
            imageUrl: line.imageUrl,
          })
        }

        await tx.orm.public.OrderStatusHistory.create({
          orderId: order.id,
          status: 'PAYMENT_PENDING',
          note: 'Sipariş oluşturuldu, ödeme bekleniyor.',
          createdBy: 'system',
        })

        await holdStockForNewOrder(
          tx,
          order.id,
          quote.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity, name: l.name }))
        )
      })
      break
    } catch (err) {
      if (err instanceof InsufficientStockError) {
        throw new CheckoutError('OUT_OF_STOCK', err.message)
      }
      if (checkoutKey && isUniqueViolation(err, 'checkout_key')) {
        // A concurrent submit of the same checkout won the race; return its order.
        const winner = await findByCheckoutKey(checkoutKey)
        if (winner && winner.userId === userId) return winner
      }
      if (attempt < 4 && isUniqueViolation(err, 'order_number')) continue
      throw err
    }
  }

  const created = await findOrderByNumber(orderNumber)
  if (!created) throw new Error('Sipariş kaydedildi ancak okunamadı.')
  // Stock was taken; let the storefront pick up the new numbers.
  refreshCatalogStock()

  await logAuditEvent({
    userId,
    action: 'ORDER_CREATED',
    entity: 'Order',
    entityId: orderNumber,
    metadata: { total: created.totalAmount, itemCount: created.items.length, shippingMethod },
  })

  createNotification({ orderNumber, eventType: 'ORDER_CREATED' }).catch((err) => {
    console.warn('[orders.service] Error sending ORDER_CREATED notification:', err)
  })

  return created
}

async function findByCheckoutKey(checkoutKey: string): Promise<StoredOrder | null> {
  const row = await withRelations().where({ checkoutKey }).first()
  return row ? toStoredOrder(row) : null
}

// ─────────────────────────────────────────────────────────────
// Status
// ─────────────────────────────────────────────────────────────

/**
 * Validates and updates order status through the central transition machine.
 * The status change is a compare-and-set on the current status, so two concurrent
 * callers (e.g. a duplicated webhook) cannot both apply the same transition.
 */
export async function updateOrderStatus(
  orderNumber: string,
  targetStatus: string,
  note?: string,
  changedBy = 'system'
): Promise<{ success: boolean; order?: StoredOrder; error?: string }> {
  const order = await findOrderByNumber(orderNumber)
  if (!order) {
    return { success: false, error: 'Sipariş bulunamadı.' }
  }

  const fromStatus = order.status
  const allowed = VALID_ORDER_TRANSITIONS[fromStatus] || []
  if (!allowed.includes(targetStatus)) {
    const error = `Geçersiz durum geçişi: '${fromStatus}' durumundaki sipariş '${targetStatus}' yapılamaz.`
    console.error(`[orders.service] ${orderNumber}: ${error}`)
    return { success: false, error }
  }

  const applied = await db.transaction(async (tx) => {
    const plan = db.raw.sql`UPDATE orders SET status = ${targetStatus}::"OrderStatus", updated_at = now() WHERE id = ${order.id} AND status = ${fromStatus}::"OrderStatus"`.affectedCount().build()
    const { affectedRows } = await tx.execute(plan)
    if (affectedRows !== 1) return false
    await tx.orm.public.OrderStatusHistory.create({
      orderId: order.id,
      status: targetStatus as never,
      note: note || `Sipariş durumu güncellendi: ${targetStatus}`,
      createdBy: changedBy,
    })
    return true
  })

  if (!applied) {
    return { success: false, error: 'Sipariş durumu eşzamanlı olarak değiştirildi. Lütfen tekrar deneyin.' }
  }

  if (targetStatus === 'CANCELLED' || targetStatus === 'PAYMENT_FAILED') {
    // Unshipped goods go back on the shelf whether or not the order had been paid.
    await releaseOrderStock(order.id, { includeCommitted: targetStatus === 'CANCELLED' })
  }

  if (targetStatus === 'CANCELLED') {
    await logAuditEvent({
      action: 'ORDER_CANCELLED',
      entity: 'Order',
      entityId: orderNumber,
      metadata: { changedBy, note },
    })
  }

  await logAuditEvent({
    action: 'ORDER_STATUS_CHANGED',
    entity: 'Order',
    entityId: orderNumber,
    metadata: { fromStatus, toStatus: targetStatus, changedBy, note },
  })

  let notifType: NotificationEventType | null = null
  if (targetStatus === 'CONFIRMED') notifType = 'ORDER_CONFIRMED'
  else if (targetStatus === 'PREPARING') notifType = 'ORDER_PREPARING'
  else if (targetStatus === 'SHIPPED') notifType = 'ORDER_SHIPPED'
  else if (targetStatus === 'DELIVERED') notifType = 'ORDER_DELIVERED'
  else if (targetStatus === 'CANCELLED') notifType = 'ORDER_CANCELLED'

  // Marketplace customers are informed by the marketplace; we have no address for them.
  if (notifType && order.channel === 'DIRECT') {
    createNotification({
      orderNumber,
      eventType: notifType,
      metadata: notifType === 'ORDER_CANCELLED' ? { cancellationReason: note } : undefined,
    }).catch((err) => {
      console.warn(`[orders.service] Error queueing ${notifType} notification:`, err)
    })
  }

  return { success: true, order: (await findOrderByNumber(orderNumber)) ?? undefined }
}

/** Marks the order paid (used by the payment service inside its own flow). */
export async function markOrderPaid(orderId: string, paidAt: Date): Promise<void> {
  await db.orm.public.Order.where({ id: orderId }).update({ paidAt: toDbTimestamp(paidAt) as never })
}
