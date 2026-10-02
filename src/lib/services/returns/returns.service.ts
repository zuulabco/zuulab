import 'server-only'
import { db } from '@/prisma/db'
import { round2 } from '@/lib/pricing/money'
import { dbNumeric } from '@/lib/db/numeric'
import { dbTimestampToIso, toDbTimestamp } from '@/lib/db/time'
import { findOrderByNumber, updateOrderStatus } from '../orders.service'
import { restockReturnedUnits, takeExchangeUnits, InsufficientStockError } from '../checkout/stock.service'
import { getPaymentProvider } from '../payment/provider.factory'
import { getReturnShippingProvider } from '../shipping/shipping-provider.factory'
import { createNotification } from '../notification/notification.service'
import { logAuditEvent } from '../admin.service'
import type {
  ReturnRequest,
  ReturnItem,
  ReturnShipmentRecord,
  ReturnEventRecord,
  CreateReturnRequestInput,
  ReturnStatus,
  ReturnInspectionResolution,
} from './return.interface'
import { VALID_RETURN_TRANSITIONS } from './return.interface'

/**
 * Returns and exchanges (RMA), stored in Postgres only.
 *
 * - Eligibility, quantities and refund amounts are computed on the server from
 *   the order; nothing the customer sends is trusted.
 * - Status changes are compare-and-set on the current status and always write a
 *   ReturnEvent, so concurrent admin clicks cannot apply a step twice.
 * - Refunds go through PayTR's refund API for the order's paid payment; the total
 *   refunded for an order can never exceed what was paid.
 * - Restocked units go back to products.stock (the sellable quantity), once per
 *   return item.
 */

/** Statutory right of withdrawal in Türkiye: 14 days from delivery. */
const RETURN_WINDOW_DAYS = 14
const ACTIVE_RETURN_STATUSES: ReturnStatus[] = ['REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'RETURN_SHIPPING_CREATED', 'IN_TRANSIT']

// ─────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────

function returnQuery() {
  return db.orm.public.ReturnRequest
    .include('order', (o) => o.select('id', 'orderNumber'))
    .include('user', (u) => u.select('id', 'name', 'email'))
    .include('items')
    .include('shipment')
    .include('events', (e) => e.orderBy((x) => x.createdAt.asc()))
}

type ReturnRow = NonNullable<Awaited<ReturnType<ReturnType<typeof returnQuery>['first']>>>

function toReturnRequest(raw: ReturnRow): ReturnRequest {
  const shipment = (raw as unknown as { shipment?: Record<string, unknown> | Array<Record<string, unknown>> | null }).shipment
  const shipmentRow = Array.isArray(shipment) ? shipment[0] : shipment
  return {
    id: raw.id,
    returnNumber: raw.returnNumber,
    orderId: raw.orderId,
    orderNumber: raw.order?.orderNumber ?? raw.orderId,
    userId: raw.userId,
    customerName: raw.user?.name || 'Değerli Müşterimiz',
    customerEmail: raw.user?.email ?? '',
    type: raw.type as ReturnRequest['type'],
    status: raw.status as ReturnStatus,
    reason: raw.reason,
    customerNote: raw.customerNote ?? undefined,
    adminNote: raw.adminNote ?? undefined,
    photoUrls: [...(raw.photoUrls ?? [])],
    photos: [...(raw.photoUrls ?? [])],
    refundAmount: Number(raw.refundAmount),
    refundStatus: (raw.refundStatus ?? undefined) as ReturnRequest['refundStatus'],
    refundRef: raw.refundRef ?? null,
    exchangeOrderNumber: raw.exchangeOrderId ?? null,
    replacementOrderNumber: raw.exchangeOrderId ?? null,
    items: (raw.items ?? []).map(
      (i): ReturnItem => ({
        id: i.id,
        returnRequestId: i.returnRequestId,
        orderItemId: i.orderItemId,
        productId: i.productId,
        productName: i.productName,
        sku: i.sku,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        reason: i.reason,
        customerNote: i.customerNote ?? undefined,
        condition: i.condition ?? undefined,
        inspectionResult: i.inspectionResult ?? undefined,
        resolution: (i.resolution ?? undefined) as ReturnInspectionResolution | undefined,
        replacementSku: i.replacementSku ?? undefined,
        restocked: Boolean(i.restocked),
        restockedAt: dbTimestampToIso(i.restockedAt),
      })
    ),
    shipment: shipmentRow
      ? ({
          id: String(shipmentRow.id),
          returnRequestId: String(shipmentRow.returnRequestId),
          provider: String(shipmentRow.provider),
          trackingNumber: String(shipmentRow.trackingNumber),
          trackingUrl: String(shipmentRow.trackingUrl),
          labelData: (shipmentRow.labelData as string | null) ?? undefined,
          status: String(shipmentRow.status),
          shippedAt: dbTimestampToIso(shipmentRow.shippedAt),
          deliveredAt: dbTimestampToIso(shipmentRow.deliveredAt),
          createdAt: dbTimestampToIso(shipmentRow.createdAt) ?? '',
          updatedAt: dbTimestampToIso(shipmentRow.updatedAt) ?? '',
        } satisfies ReturnShipmentRecord)
      : null,
    events: (raw.events ?? []).map(
      (e): ReturnEventRecord => ({
        id: e.id,
        returnRequestId: e.returnRequestId,
        status: e.status as ReturnStatus,
        note: e.note ?? undefined,
        metadata: (e.metadata ?? undefined) as Record<string, unknown> | undefined,
        createdAt: dbTimestampToIso(e.createdAt) ?? '',
        createdBy: e.createdBy ?? undefined,
      })
    ),
    requestedAt: dbTimestampToIso(raw.requestedAt) ?? dbTimestampToIso(raw.createdAt) ?? '',
    approvedAt: dbTimestampToIso(raw.approvedAt),
    rejectedAt: dbTimestampToIso(raw.rejectedAt),
    receivedAt: dbTimestampToIso(raw.receivedAt),
    inspectedAt: dbTimestampToIso(raw.inspectedAt),
    completedAt: dbTimestampToIso(raw.completedAt),
    createdAt: dbTimestampToIso(raw.createdAt) ?? '',
    updatedAt: dbTimestampToIso(raw.updatedAt) ?? '',
  }
}

async function getByNumber(returnNumber: string): Promise<ReturnRequest | null> {
  const row = await returnQuery().where({ returnNumber }).first()
  return row ? toReturnRequest(row) : null
}

async function requireReturn(returnNumber: string): Promise<ReturnRequest> {
  const r = await getByNumber(returnNumber)
  if (!r) throw new Error(`İade talebi bulunamadı: ${returnNumber}`)
  return r
}

// ─────────────────────────────────────────────────────────────
// State machine
// ─────────────────────────────────────────────────────────────

/**
 * Moves a return from `from` to `to` atomically (compare-and-set on status),
 * applies `fields` and records an event. Throws if the transition is not allowed
 * or someone else changed the status first.
 */
async function transition(
  ret: ReturnRequest,
  to: ReturnStatus,
  params: { note: string; createdBy: string; fields?: Record<string, unknown>; metadata?: Record<string, unknown> }
): Promise<void> {
  const allowed = VALID_RETURN_TRANSITIONS[ret.status] || []
  if (!allowed.includes(to)) {
    throw new Error(`Geçersiz durum geçişi: '${ret.status}' durumundaki iade talebi '${to}' yapılamaz.`)
  }

  await db.transaction(async (tx) => {
    const { affectedRows } = await tx.execute(
      db.raw.sql`UPDATE return_requests SET status = ${to}::"ReturnRequestStatus", updated_at = now()
        WHERE id = ${ret.id} AND status = ${ret.status}::"ReturnRequestStatus"`.affectedCount().build()
    )
    if (affectedRows !== 1) {
      throw new Error('İade talebi eşzamanlı olarak güncellendi. Lütfen sayfayı yenileyip tekrar deneyin.')
    }
    if (params.fields && Object.keys(params.fields).length > 0) {
      await tx.orm.public.ReturnRequest.where({ id: ret.id }).update(params.fields as never)
    }
    await tx.orm.public.ReturnEvent.create({
      returnRequestId: ret.id,
      status: to,
      note: params.note,
      createdBy: params.createdBy,
      metadata: (params.metadata ?? null) as never,
    })
  })
}

function notify(ret: ReturnRequest, eventType: string, metadata: Record<string, unknown>) {
  createNotification({
    orderNumber: ret.orderNumber,
    eventType: eventType as never,
    recipientEmail: ret.customerEmail,
    metadata: { returnNumber: ret.returnNumber, ...metadata },
  }).catch((err) => console.warn(`[returns.service] ${eventType} notification failed:`, err))
}

// ─────────────────────────────────────────────────────────────
// Customer
// ─────────────────────────────────────────────────────────────

/**
 * Validates eligibility and creates a customer return/exchange request.
 */
export async function createReturnRequest(input: CreateReturnRequestInput): Promise<ReturnRequest> {
  const order = await findOrderByNumber(input.orderNumber)
  if (!order) throw new Error(`Sipariş bulunamadı: #${input.orderNumber}`)
  if (!input.userId || order.userId !== input.userId) {
    throw new Error('Bu sipariş için iade talebi oluşturma yetkiniz bulunmuyor.')
  }

  // Returns are for goods the customer has (or is about to) receive; an order not
  // yet shipped is cancelled instead.
  if (!['SHIPPED', 'DELIVERED', 'RETURN_REQUESTED'].includes(order.status)) {
    throw new Error(
      `Sipariş durumu (${order.status}) iade/değişim için uygun değildir. Henüz kargoya verilmemiş siparişler iptal edilebilir.`
    )
  }

  // The 14-day window runs from delivery.
  const delivered = order.statusHistory.find((h) => h.status === 'DELIVERED')
  if (delivered) {
    const days = (Date.now() - new Date(delivered.createdAt).getTime()) / (24 * 3600 * 1000)
    if (days > RETURN_WINDOW_DAYS) {
      throw new Error(
        `Yasal iade süresi (${RETURN_WINDOW_DAYS} gün) aşılmıştır. Teslimattan bu yana ${Math.floor(days)} gün geçti.`
      )
    }
  }

  if (!input.items || input.items.length === 0) {
    throw new Error('İade edilecek en az bir ürün seçilmelidir.')
  }

  const existing = (await returnQuery().where({ orderId: order.id }).all())
    .map(toReturnRequest)
    .filter((r) => r.status !== 'REJECTED' && r.status !== 'CANCELLED')
  const active = existing.find((r) => ACTIVE_RETURN_STATUSES.includes(r.status))
  if (active) {
    throw new Error(`Bu sipariş için zaten devam eden bir iade/değişim talebi var (#${active.returnNumber}).`)
  }

  const discountRatio = order.subtotal > 0 ? (order.discountAmount || 0) / order.subtotal : 0
  const items: Array<{
    orderItemId: string
    productId: string
    productName: string
    sku: string
    quantity: number
    unitPrice: number
    reason: string
    customerNote: string | null
    replacementSku: string | null
  }> = []
  let refundTotal = 0

  for (const requested of input.items) {
    const qty = Math.floor(Number(requested.quantity))
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error(`Geçersiz iade adedi: ${requested.quantity}. En az 1 adet seçilmelidir.`)
    }
    const orderItem = order.items.find(
      (oi) => oi.id === requested.orderItemId || oi.productId === requested.productId || oi.sku === requested.productId
    )
    if (!orderItem) {
      throw new Error(`Siparişte yer almayan ürün için iade talebi oluşturulamaz: ${requested.productId}`)
    }

    const alreadyReturned = existing
      .flatMap((r) => r.items)
      .filter((ri) => ri.orderItemId === orderItem.id || (ri.productId === orderItem.productId && ri.orderItemId === orderItem.productId))
      .reduce((sum, ri) => sum + ri.quantity, 0)
    const returnable = orderItem.quantity - alreadyReturned
    if (qty > returnable) {
      throw new Error(`'${orderItem.productName}' için en fazla ${returnable} adet iade edilebilir.`)
    }

    // The customer gets back what they paid for the item: its price minus its
    // share of the order discount.
    refundTotal += round2(orderItem.unitPrice * qty * (1 - discountRatio))
    items.push({
      orderItemId: orderItem.id,
      productId: orderItem.productId,
      productName: orderItem.productName,
      sku: orderItem.sku,
      quantity: qty,
      unitPrice: orderItem.unitPrice,
      reason: String(requested.reason || input.reason),
      customerNote: requested.customerNote || input.customerNote || null,
      replacementSku: requested.replacementSku || null,
    })
  }
  refundTotal = round2(refundTotal)

  const digits = order.orderNumber.replace(/[^0-9]/g, '') || String(Date.now()).slice(-8)
  let returnNumber = ''
  for (let seq = existing.length + 1; ; seq++) {
    returnNumber = `RMA-${digits}-${String(seq).padStart(2, '0')}`
    try {
      await db.transaction(async (tx) => {
        const created = await tx.orm.public.ReturnRequest.create({
          returnNumber,
          orderId: order.id,
          userId: input.userId,
          type: (input.type === 'EXCHANGE' ? 'EXCHANGE' : 'RETURN') as never,
          status: 'REQUESTED',
          reason: String(input.reason),
          customerNote: input.customerNote || null,
          photoUrls: (input.photos ?? []).slice(0, 10),
          refundAmount: dbNumeric(refundTotal),
          refundStatus: 'PENDING',
        })
        for (const item of items) {
          await tx.orm.public.ReturnItem.create({
            returnRequestId: created.id,
            orderItemId: item.orderItemId,
            productId: item.productId,
            productName: item.productName,
            sku: item.sku,
            quantity: item.quantity,
            unitPrice: dbNumeric(item.unitPrice),
            reason: item.reason,
            customerNote: item.customerNote,
            replacementSku: item.replacementSku,
            restocked: false,
          })
        }
        await tx.orm.public.ReturnEvent.create({
          returnRequestId: created.id,
          status: 'REQUESTED',
          note: `İade talebi oluşturuldu: ${input.reason}`,
          createdBy: input.userId,
        })
      })
      break
    } catch (err) {
      const text = String((err as Error)?.message ?? err) + JSON.stringify(err ?? {})
      if (seq < existing.length + 6 && /unique|duplicate key|23505/i.test(text) && text.includes('return_number')) continue
      throw err
    }
  }

  if (order.status === 'SHIPPED' || order.status === 'DELIVERED') {
    await updateOrderStatus(order.orderNumber, 'RETURN_REQUESTED', `İade talebi oluşturuldu (${returnNumber})`, input.userId)
  }

  await logAuditEvent({
    action: 'RETURN_CREATED',
    entity: 'ReturnRequest',
    entityId: returnNumber,
    userId: input.userId,
    metadata: { orderNumber: order.orderNumber, type: input.type, itemCount: items.length, refundAmount: refundTotal },
  })

  const created = await requireReturn(returnNumber)
  notify(created, 'RETURN_REQUESTED', { returnReason: input.reason, refundAmount: refundTotal })
  return created
}

/**
 * Retrieves a return request by RMA number; with `userId`, only the owner's.
 */
export async function getReturnRequestByNumber(returnNumber: string, userId?: string): Promise<ReturnRequest | null> {
  const ret = await getByNumber(returnNumber)
  if (!ret) return null
  if (userId && ret.userId !== userId) {
    throw new Error('Bu iade talebine erişim yetkiniz bulunmuyor.')
  }
  return ret
}

/**
 * Retrieves all return requests of an order (optionally only the user's).
 */
export async function getReturnsByOrderNumber(orderNumber: string, userId?: string): Promise<ReturnRequest[]> {
  const order = await db.orm.public.Order.select('id').where({ orderNumber }).first()
  if (!order) return []
  let query = returnQuery().where({ orderId: order.id })
  if (userId) query = query.where({ userId })
  return (await query.orderBy((r) => r.createdAt.desc()).all()).map(toReturnRequest)
}

/**
 * Customer: cancels a return before the package is on its way.
 */
export async function cancelReturnRequest(params: { returnNumber: string; userId: string; reason?: string }): Promise<ReturnRequest> {
  const ret = await requireReturn(params.returnNumber)
  if (ret.userId !== params.userId) {
    throw new Error('Bu iade talebini iptal etme yetkiniz bulunmuyor.')
  }
  await transition(ret, 'CANCELLED', {
    note: params.reason || 'Müşteri talebiyle iade iptal edildi.',
    createdBy: params.userId,
  })

  // Nothing else open for the order: it goes back to its delivered state.
  const stillOpen = (await getReturnsByOrderNumber(ret.orderNumber)).some((r) => ACTIVE_RETURN_STATUSES.includes(r.status))
  if (!stillOpen) {
    await updateOrderStatus(ret.orderNumber, 'DELIVERED', `İade talebi iptal edildi (${ret.returnNumber})`, params.userId)
  }

  await logAuditEvent({ action: 'RETURN_CANCELLED', entity: 'ReturnRequest', entityId: params.returnNumber, userId: params.userId, metadata: { reason: params.reason } })
  return requireReturn(params.returnNumber)
}

// ─────────────────────────────────────────────────────────────
// Admin
// ─────────────────────────────────────────────────────────────

/**
 * Admin: all return requests with filters, newest first.
 */
export async function getAllReturns(filters?: { status?: ReturnStatus; type?: string; search?: string }): Promise<ReturnRequest[]> {
  let query = returnQuery()
  if (filters?.status) query = query.where({ status: filters.status as never })
  if (filters?.type) query = query.where({ type: filters.type as never })
  let list = (await query.orderBy((r) => r.createdAt.desc()).limit(500).all()).map(toReturnRequest)
  if (filters?.search) {
    const q = filters.search.toLocaleLowerCase('tr-TR')
    list = list.filter(
      (r) =>
        r.returnNumber.toLowerCase().includes(q) ||
        r.orderNumber.toLowerCase().includes(q) ||
        r.customerName.toLocaleLowerCase('tr-TR').includes(q) ||
        r.customerEmail.toLowerCase().includes(q)
    )
  }
  return list
}

/**
 * Admin: approves a return request (optionally creating the return label).
 */
export async function approveReturnRequest(
  arg1: string | { returnNumber: string; adminUserId?: string; note?: string; autoGenerateShipping?: boolean; provider?: string },
  adminUserId?: string,
  note?: string
): Promise<ReturnRequest> {
  const params = typeof arg1 === 'string' ? { returnNumber: arg1, adminUserId, note, autoGenerateShipping: false } : arg1
  const ret = await requireReturn(params.returnNumber)

  await transition(ret, 'APPROVED', {
    note: params.note || 'İade talebi onaylandı.',
    createdBy: params.adminUserId || 'admin',
    fields: { approvedAt: toDbTimestamp(), adminNote: params.note || null },
  })

  if (params.autoGenerateShipping) {
    await createReturnShipmentForReturn({
      returnNumber: params.returnNumber,
      provider: params.provider,
      adminUserId: params.adminUserId,
    }).catch((err) => console.warn('[returns] auto-shipping failed:', err))
  }

  await logAuditEvent({ action: 'RETURN_APPROVED', entity: 'ReturnRequest', entityId: params.returnNumber, userId: params.adminUserId, metadata: { note: params.note } })
  const updated = await requireReturn(params.returnNumber)
  notify(updated, 'RETURN_APPROVED', { trackingNumber: updated.shipment?.trackingNumber, carrier: updated.shipment?.provider })
  return updated
}

/**
 * Admin: rejects a return request.
 */
export async function rejectReturnRequest(
  arg1: string | { returnNumber: string; reason: string; adminUserId?: string },
  reason?: string,
  adminUserId?: string
): Promise<ReturnRequest> {
  const params = typeof arg1 === 'string' ? { returnNumber: arg1, reason: reason || '', adminUserId } : arg1
  const ret = await requireReturn(params.returnNumber)

  await transition(ret, 'REJECTED', {
    note: `İade talebi reddedildi: ${params.reason}`,
    createdBy: params.adminUserId || 'admin',
    fields: { rejectedAt: toDbTimestamp(), adminNote: params.reason || null },
  })

  const stillOpen = (await getReturnsByOrderNumber(ret.orderNumber)).some((r) => ACTIVE_RETURN_STATUSES.includes(r.status))
  if (!stillOpen) {
    await updateOrderStatus(ret.orderNumber, 'DELIVERED', `İade talebi reddedildi (${ret.returnNumber})`, params.adminUserId || 'admin')
  }

  await logAuditEvent({ action: 'RETURN_REJECTED', entity: 'ReturnRequest', entityId: params.returnNumber, userId: params.adminUserId, metadata: { reason: params.reason } })
  const updated = await requireReturn(params.returnNumber)
  notify(updated, 'RETURN_REJECTED', { cancellationReason: params.reason })
  return updated
}

/**
 * Creates the return shipping label through the return shipping provider. The
 * unique return_request_id on return_shipments prevents a second label.
 */
export async function createReturnShipmentForReturn(params: {
  returnNumber: string
  provider?: string
  adminUserId?: string
}): Promise<ReturnShipmentRecord> {
  const ret = await requireReturn(params.returnNumber)
  if (ret.shipment?.trackingNumber) return ret.shipment

  const order = await findOrderByNumber(ret.orderNumber)
  if (!order) throw new Error(`Sipariş bulunamadı: #${ret.orderNumber}`)
  const address = order.shippingAddressSnapshot

  const provider = getReturnShippingProvider(params.provider)
  const items = ret.items.map((i) => ({ productName: i.productName, sku: i.sku, quantity: i.quantity }))
  const result = provider.createReturnShipment
    ? await provider.createReturnShipment({
        returnNumber: ret.returnNumber,
        orderNumber: ret.orderNumber,
        customerName: address.fullName || ret.customerName,
        customerPhone: address.phone,
        pickupAddress: {
          addressLine: address.addressLine,
          city: address.city,
          district: address.district || address.city,
          postalCode: address.postalCode,
          country: address.country || 'TR',
        },
        items,
        packageCount: 1,
      })
    : await provider.createShipment({
        orderNumber: ret.returnNumber,
        customerName: address.fullName || ret.customerName,
        customerPhone: address.phone,
        shippingAddress: {
          addressLine: address.addressLine,
          city: address.city,
          district: address.district || address.city,
          postalCode: address.postalCode,
        },
        items,
        packageCount: 1,
      } as never)

  try {
    await db.orm.public.ReturnShipment.create({
      returnRequestId: ret.id,
      provider: provider.providerName,
      trackingNumber: result.trackingNumber,
      trackingUrl: result.trackingUrl ?? '',
      labelData: (result as { labelData?: string }).labelData ?? null,
      labelFormat: (result as { labelFormat?: string }).labelFormat ?? null,
      status: (result as { status?: string }).status || 'LABEL_CREATED',
    })
  } catch (err) {
    if (/unique|duplicate key|23505/i.test(String((err as Error)?.message ?? err) + JSON.stringify(err ?? {}))) {
      return (await requireReturn(params.returnNumber)).shipment!
    }
    throw err
  }

  if (ret.status === 'APPROVED') {
    await transition(ret, 'RETURN_SHIPPING_CREATED', {
      note: `İade kargo barkodu oluşturuldu (${provider.providerName}: ${result.trackingNumber})`,
      createdBy: params.adminUserId || 'system',
    })
  }

  await logAuditEvent({
    action: 'RETURN_SHIPMENT_CREATED',
    entity: 'ReturnRequest',
    entityId: ret.returnNumber,
    userId: params.adminUserId,
    metadata: { provider: provider.providerName, trackingNumber: result.trackingNumber },
  })
  const updated = await requireReturn(params.returnNumber)
  notify(updated, 'RETURN_SHIPMENT_CREATED', {
    carrier: provider.providerName,
    trackingNumber: result.trackingNumber,
    trackingUrl: result.trackingUrl,
  })
  return updated.shipment!
}

/**
 * Admin: records that the returned package arrived.
 */
export async function receiveReturnPackage(
  arg1: string | { returnNumber: string; adminUserId?: string; note?: string },
  adminUserId?: string,
  note?: string
): Promise<ReturnRequest> {
  const params = typeof arg1 === 'string' ? { returnNumber: arg1, adminUserId, note } : arg1
  const ret = await requireReturn(params.returnNumber)

  await transition(ret, 'RECEIVED', {
    note: params.note || 'İade paketi teslim alındı.',
    createdBy: params.adminUserId || 'warehouse',
    fields: { receivedAt: toDbTimestamp() },
  })

  await updateOrderStatus(ret.orderNumber, 'RETURNED', `İade paketi teslim alındı (${ret.returnNumber})`, params.adminUserId || 'warehouse')
  await logAuditEvent({ action: 'RETURN_RECEIVED', entity: 'ReturnRequest', entityId: params.returnNumber, userId: params.adminUserId, metadata: { note: params.note } })

  const updated = await requireReturn(params.returnNumber)
  notify(updated, 'RETURN_RECEIVED', {})
  return updated
}

export const receiveReturnAtWarehouse = receiveReturnPackage

/**
 * Admin: records the inspection of each returned item; RESTOCK puts the units
 * back on sale (once per item).
 */
export async function inspectReturnItems(
  arg1:
    | string
    | {
        returnNumber: string
        items?: Array<Record<string, unknown>>
        itemResolutions?: Array<{
          itemId: string
          condition: string
          inspectionResult: string
          resolution: ReturnInspectionResolution
          replacementSku?: string
        }>
        adminUserId?: string
        adminNote?: string
      },
  resolutionsOrAdminId?: unknown,
  adminUserIdParam?: string
): Promise<ReturnRequest> {
  type Resolution = { itemId: string; condition: string; inspectionResult: string; resolution: ReturnInspectionResolution; replacementSku?: string }
  let params: { returnNumber: string; itemResolutions: Resolution[]; adminUserId?: string; adminNote?: string }

  if (typeof arg1 === 'string') {
    params = {
      returnNumber: arg1,
      itemResolutions: Array.isArray(resolutionsOrAdminId) ? (resolutionsOrAdminId as Resolution[]) : [],
      adminUserId: adminUserIdParam || (typeof resolutionsOrAdminId === 'string' ? resolutionsOrAdminId : undefined),
    }
  } else {
    const rawList = (arg1.itemResolutions || arg1.items || []) as Array<Record<string, unknown>>
    params = {
      returnNumber: arg1.returnNumber,
      itemResolutions: rawList.map((ri) => ({
        itemId: String(ri.itemId || ri.orderItemId || ri.productId),
        condition: String(ri.condition || 'USED'),
        inspectionResult: String(ri.inspectionResult || 'PASSED'),
        resolution: (ri.resolution as ReturnInspectionResolution) || 'RESTOCK',
        replacementSku: ri.replacementSku ? String(ri.replacementSku) : undefined,
      })),
      adminUserId: arg1.adminUserId,
      adminNote: arg1.adminNote,
    }
  }

  const ret = await requireReturn(params.returnNumber)
  if (!(VALID_RETURN_TRANSITIONS[ret.status] || []).includes('INSPECTED')) {
    throw new Error(`Geçersiz durum geçişi: '${ret.status}' durumundaki iade talebi incelenemez.`)
  }

  let restockedUnits = 0
  for (const resolution of params.itemResolutions) {
    const item = ret.items.find(
      (ri) => ri.id === resolution.itemId || ri.orderItemId === resolution.itemId || ri.productId === resolution.itemId
    )
    if (!item) continue

    await db.orm.public.ReturnItem.where({ id: item.id }).update({
      condition: resolution.condition,
      inspectionResult: resolution.inspectionResult,
      resolution: resolution.resolution as never,
      replacementSku: resolution.replacementSku ?? null,
    })

    if (resolution.resolution === 'RESTOCK' && !item.restocked) {
      const done = await restockReturnedUnits({
        productId: item.productId,
        quantity: item.quantity,
        returnNumber: ret.returnNumber,
        returnItemId: item.id,
      })
      await db.orm.public.ReturnItem.where({ id: item.id }).update({ restocked: true, restockedAt: toDbTimestamp() as never })
      if (done) restockedUnits += item.quantity
    }
  }

  await transition(ret, 'INSPECTED', {
    note: `Kalite kontrol tamamlandı (${params.itemResolutions.length} ürün incelendi, ${restockedUnits} adet stoğa alındı)`,
    createdBy: params.adminUserId || 'quality-control',
    fields: { inspectedAt: toDbTimestamp(), ...(params.adminNote ? { adminNote: params.adminNote } : {}) },
    metadata: { resolutions: params.itemResolutions },
  })

  await logAuditEvent({ action: 'RETURN_INSPECTED', entity: 'ReturnRequest', entityId: params.returnNumber, userId: params.adminUserId, metadata: { resolutions: params.itemResolutions } })
  return requireReturn(params.returnNumber)
}

/**
 * Admin: refunds the customer through PayTR.
 *
 * The return moves to REFUND_PENDING before PayTR is called (so a second click
 * cannot send a second refund), then to COMPLETED or FAILED by PayTR's answer.
 * If PayTR's answer is lost, the return stays REFUND_PENDING with refundStatus
 * UNKNOWN and must be checked in the PayTR panel; it is never retried blindly.
 */
export async function processRefundForReturn(
  arg1: string | { returnNumber: string; adminUserId?: string },
  adminUserIdParam?: string
): Promise<ReturnRequest> {
  const params = typeof arg1 === 'string' ? { returnNumber: arg1, adminUserId: adminUserIdParam } : arg1
  const actor = params.adminUserId || 'finance'
  const ret = await requireReturn(params.returnNumber)

  if (ret.refundStatus === 'COMPLETED') return ret
  if (ret.status === 'REFUND_PENDING') {
    throw new Error('Bu iade için para iadesi işlemi zaten sürüyor veya sonucu belirsiz. PayTR panelinden kontrol edin.')
  }

  // Never refund more than was paid for the order.
  const payment = await db.orm.public.Payment
    .where({ orderId: ret.orderId })
    .where((p) => p.status.in(['SUCCEEDED', 'PARTIALLY_REFUNDED'] as never[]))
    .orderBy((p) => p.createdAt.desc())
    .first()
  if (!payment?.merchantOid) {
    throw new Error('Bu siparişin iade edilebilecek bir ödemesi bulunamadı.')
  }
  const refundedBefore = (await db.orm.public.ReturnRequest.select('refundAmount')
    .where({ orderId: ret.orderId, refundStatus: 'COMPLETED' })
    .all())
    .reduce((sum, r) => sum + Number(r.refundAmount), 0)
  const paid = Number(payment.paidAmount ?? payment.amount)
  if (round2(refundedBefore + ret.refundAmount) > round2(paid) + 0.009) {
    throw new Error(
      `İade tutarı ödenen tutarı aşıyor (ödenen ₺${paid.toFixed(2)}, daha önce iade ₺${refundedBefore.toFixed(2)}, bu iade ₺${ret.refundAmount.toFixed(2)}).`
    )
  }

  await transition(ret, 'REFUND_PENDING', {
    note: `PayTR'ye ₺${ret.refundAmount.toFixed(2)} iade isteği gönderiliyor.`,
    createdBy: actor,
    fields: { refundStatus: 'PROCESSING' },
  })
  const pending = await requireReturn(params.returnNumber)

  const referenceNo = `RMA${ret.returnNumber.replace(/[^A-Za-z0-9]/g, '')}`
  const result = await getPaymentProvider().refund(payment.merchantOid, ret.refundAmount, referenceNo)
  const outcome = result.outcome ?? (result.success ? 'SUCCEEDED' : 'FAILED')

  if (outcome === 'SUCCEEDED') {
    const refundRef = result.refundId || referenceNo
    await transition(pending, 'COMPLETED', {
      note: `Para iadesi tamamlandı: ₺${ret.refundAmount.toFixed(2)} (PayTR ref: ${refundRef})`,
      createdBy: actor,
      fields: { refundStatus: 'COMPLETED', refundRef, completedAt: toDbTimestamp() },
    })
    const fullyRefunded = round2(refundedBefore + ret.refundAmount) >= round2(paid)
    await db.runtime().execute(
      db.raw.sql`UPDATE payments SET status = ${fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED'}::"PaymentStatus", updated_at = now() WHERE id = ${payment.id}`.affectedCount().build()
    )
    await updateOrderStatus(ret.orderNumber, 'PARTIALLY_REFUNDED', `İade tutarı ödendi (₺${ret.refundAmount.toFixed(2)})`, actor)
    await logAuditEvent({ action: 'RETURN_REFUND_COMPLETED', entity: 'ReturnRequest', entityId: params.returnNumber, userId: params.adminUserId, metadata: { refundAmount: ret.refundAmount, refundRef } })
    const updated = await requireReturn(params.returnNumber)
    notify(updated, 'REFUND_ISSUED', { refundAmount: ret.refundAmount })
    return updated
  }

  if (outcome === 'UNKNOWN') {
    await db.orm.public.ReturnRequest.where({ id: ret.id }).update({ refundStatus: 'UNKNOWN', adminNote: result.error ?? null })
    await logAuditEvent({ action: 'RETURN_REFUND_UNKNOWN', entity: 'ReturnRequest', entityId: params.returnNumber, userId: params.adminUserId, metadata: { error: result.error } })
    throw new Error(result.error || 'PayTR yanıtı alınamadı. İadenin yapılıp yapılmadığını PayTR panelinden kontrol edin.')
  }

  await transition(pending, 'FAILED', {
    note: `Para iadesi başarısız: ${result.error ?? 'PayTR iadeyi reddetti.'}`,
    createdBy: actor,
    fields: { refundStatus: 'FAILED', adminNote: result.error ?? null },
  })
  await logAuditEvent({ action: 'RETURN_REFUND_FAILED', entity: 'ReturnRequest', entityId: params.returnNumber, userId: params.adminUserId, metadata: { error: result.error } })
  throw new Error(`Para iadesi başarısız: ${result.error ?? 'PayTR iadeyi reddetti.'}`)
}

/**
 * Admin: completes an exchange by taking the replacement units from stock. The
 * replacement shipment is then created from the order screen.
 */
export async function processExchangeForReturn(
  arg1:
    | string
    | { returnNumber: string; replacementProductId?: string; replacementQuantity?: number; replacementSku?: string; adminUserId?: string },
  adminUserIdParam?: string
): Promise<ReturnRequest> {
  const params = typeof arg1 === 'string' ? { returnNumber: arg1, adminUserId: adminUserIdParam } : arg1
  const actor = params.adminUserId || 'exchange-desk'
  const ret = await requireReturn(params.returnNumber)
  if (!(VALID_RETURN_TRANSITIONS[ret.status] || []).includes('EXCHANGE_PENDING')) {
    throw new Error(`Geçersiz durum geçişi: '${ret.status}' durumundaki iade talebi değişime alınamaz.`)
  }

  const replacements =
    'replacementProductId' in params && params.replacementProductId
      ? [{ productId: params.replacementProductId, quantity: params.replacementQuantity || ret.items[0]?.quantity || 1 }]
      : ret.items.map((i) => ({ productId: i.productId, quantity: i.quantity }))

  try {
    for (const r of replacements) {
      await takeExchangeUnits({ productId: r.productId, quantity: r.quantity, returnNumber: ret.returnNumber })
    }
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      throw new Error(`Değişim ürünü için yeterli stok yok: ${err.message}`)
    }
    throw err
  }

  await transition(ret, 'EXCHANGE_PENDING', { note: 'Değişim ürünleri stoktan ayrıldı.', createdBy: actor })
  const exchangeRef = `EXC-${ret.returnNumber}`
  await transition(await requireReturn(params.returnNumber), 'COMPLETED', {
    note: `Değişim tamamlandı (${exchangeRef}); yeni ürünün kargosu sipariş ekranından oluşturulmalı.`,
    createdBy: actor,
    fields: { exchangeOrderId: exchangeRef, completedAt: toDbTimestamp() },
    metadata: { replacements },
  })

  await logAuditEvent({ action: 'RETURN_EXCHANGE_CREATED', entity: 'ReturnRequest', entityId: params.returnNumber, userId: params.adminUserId, metadata: { exchangeRef, replacements } })
  const updated = await requireReturn(params.returnNumber)
  notify(updated, 'EXCHANGE_COMPLETED', { orderNumber: exchangeRef })
  return updated
}

/**
 * Server-side refund estimate for given order items.
 */
export async function calculateOrderRefundAmount(
  orderNumber: string,
  items: Array<{ orderItemId?: string; productId?: string; quantity: number }>
): Promise<{ refundAmount: number; itemCount: number }> {
  const order = await findOrderByNumber(orderNumber)
  if (!order) throw new Error(`Sipariş bulunamadı: #${orderNumber}`)
  const discountRatio = order.subtotal > 0 ? (order.discountAmount || 0) / order.subtotal : 0

  let refundAmount = 0
  let itemCount = 0
  for (const item of items) {
    const orderItem = order.items.find(
      (oi) =>
        (item.orderItemId && (oi.id === item.orderItemId || oi.productId === item.orderItemId)) ||
        (item.productId && (oi.productId === item.productId || oi.sku === item.productId))
    )
    if (!orderItem) throw new Error(`Sipariş öğesi bulunamadı: ${item.orderItemId || item.productId}`)
    const qty = Math.min(orderItem.quantity, item.quantity)
    refundAmount += round2(orderItem.unitPrice * qty * (1 - discountRatio))
    itemCount += qty
  }
  return { refundAmount: round2(refundAmount), itemCount }
}

// Aliases for backward compat
export const createReturnShipment = createReturnShipmentForReturn
export const inspectReturnRequest = inspectReturnItems
export const getReturnRequestsByOrder = getReturnsByOrderNumber
export const getAllReturnRequests = getAllReturns
