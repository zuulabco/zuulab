import 'server-only'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { getOrderByNumber, updateOrderStatus } from '../orders.service'
import { restockProductInventory, getInventoryStatus } from '../inventory.service'
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

// ─────────────────────────────────────────────────────────────
// DEV / TEST FALLBACK — used only when DB is not configured
// ─────────────────────────────────────────────────────────────
const _devMemoryReturns: ReturnRequest[] = []

const DEFAULT_RETURN_WINDOW_DAYS = 14

// ─────────────────────────────────────────────────────────────
// DB ↔ Domain mappers
// ─────────────────────────────────────────────────────────────

function mapDbReturnToInterface(raw: any): ReturnRequest {
  return {
    id: raw.id,
    returnNumber: raw.returnNumber,
    orderId: raw.orderId,
    orderNumber: raw.order?.orderNumber ?? raw.orderId,
    userId: raw.userId,
    customerName:
      raw.user?.name ||
      `${raw.user?.firstName ?? ''} ${raw.user?.lastName ?? ''}`.trim() ||
      'Değerli Müşterimiz',
    customerEmail: raw.user?.email ?? '',
    type: raw.type as any,
    status: raw.status as ReturnStatus,
    reason: raw.reason,
    customerNote: raw.customerNote ?? undefined,
    adminNote: raw.adminNote ?? undefined,
    photoUrls: raw.photoUrls ?? [],
    photos: raw.photoUrls ?? [],
    refundAmount: Number(raw.refundAmount),
    refundStatus: (raw.refundStatus ?? undefined) as any,
    refundRef: raw.refundRef ?? null,
    exchangeOrderNumber: raw.exchangeOrderId ?? null,
    replacementOrderNumber: raw.exchangeOrderId ?? null,
    items: (raw.items ?? []).map(mapDbReturnItemToInterface),
    shipment: raw.shipment ? mapDbReturnShipmentToInterface(raw.shipment) : null,
    events: (raw.events ?? []).map(mapDbReturnEventToInterface),
    requestedAt: raw.requestedAt?.toISOString() ?? raw.createdAt?.toISOString(),
    approvedAt: raw.approvedAt?.toISOString() ?? null,
    rejectedAt: raw.rejectedAt?.toISOString() ?? null,
    receivedAt: raw.receivedAt?.toISOString() ?? null,
    inspectedAt: raw.inspectedAt?.toISOString() ?? null,
    completedAt: raw.completedAt?.toISOString() ?? null,
    createdAt: raw.createdAt?.toISOString(),
    updatedAt: raw.updatedAt?.toISOString(),
  }
}

function mapDbReturnItemToInterface(raw: any): ReturnItem {
  return {
    id: raw.id,
    returnRequestId: raw.returnRequestId,
    orderItemId: raw.orderItemId,
    productId: raw.productId,
    productName: raw.productName,
    sku: raw.sku,
    quantity: raw.quantity,
    unitPrice: Number(raw.unitPrice),
    reason: raw.reason,
    customerNote: raw.customerNote ?? undefined,
    condition: raw.condition ?? undefined,
    inspectionResult: raw.inspectionResult ?? undefined,
    resolution: raw.resolution as ReturnInspectionResolution | undefined,
    replacementSku: raw.replacementSku ?? undefined,
    restocked: raw.restocked ?? false,
    restockedAt: raw.restockedAt?.toISOString() ?? null,
  }
}

function mapDbReturnShipmentToInterface(raw: any): ReturnShipmentRecord {
  return {
    id: raw.id,
    returnRequestId: raw.returnRequestId,
    provider: raw.provider,
    trackingNumber: raw.trackingNumber,
    trackingUrl: raw.trackingUrl,
    labelData: raw.labelData ?? undefined,
    status: raw.status,
    shippedAt: raw.shippedAt?.toISOString() ?? null,
    deliveredAt: raw.deliveredAt?.toISOString() ?? null,
    createdAt: raw.createdAt?.toISOString(),
    updatedAt: raw.updatedAt?.toISOString(),
  }
}

function mapDbReturnEventToInterface(raw: any): ReturnEventRecord {
  return {
    id: raw.id,
    returnRequestId: raw.returnRequestId,
    status: raw.status as ReturnStatus,
    note: raw.note ?? undefined,
    metadata: raw.metadata ?? undefined,
    createdAt: raw.createdAt?.toISOString(),
    createdBy: raw.createdBy ?? undefined,
  }
}

// Standard include for all ReturnRequest queries
const RETURN_INCLUDE = {
  order: { select: { orderNumber: true } },
  user: { select: { name: true, firstName: true, lastName: true, email: true } },
  items: true,
  shipment: true,
  events: { orderBy: { createdAt: 'asc' as const } },
}

// ─────────────────────────────────────────────────────────────
// HELPER — get by return number (DB or dev fallback)
// ─────────────────────────────────────────────────────────────

async function _getReturnFromDb(returnNumber: string): Promise<ReturnRequest | null> {
  if (!isDatabaseConfigured) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DATABASE_CONFIGURATION_ERROR: DATABASE_URL must be configured in production.')
    }
    return _devMemoryReturns.find((r) => r.returnNumber === returnNumber) ?? null
  }
  try {
    const raw = await (db.orm.public.ReturnRequest as any).findFirst({
      where: { returnNumber },
      include: RETURN_INCLUDE,
    })
    return raw ? mapDbReturnToInterface(raw) : null
  } catch (err) {
    console.warn('[returns.service] DB query failed, falling back to dev memory:', err)
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DATABASE_CONFIGURATION_ERROR: Failed to query database in production.')
    }
    return _devMemoryReturns.find((r) => r.returnNumber === returnNumber) ?? null
  }
}

// ─────────────────────────────────────────────────────────────
// STATE MACHINE
// ─────────────────────────────────────────────────────────────

function assertValidReturnTransition(currentStatus: ReturnStatus, targetStatus: ReturnStatus): void {
  const allowed = VALID_RETURN_TRANSITIONS[currentStatus] || []
  if (!allowed.includes(targetStatus)) {
    throw new Error(
      `Geçersiz durum geçişi: '${currentStatus}' durumundaki iade talebi '${targetStatus}' yapılamaz.`
    )
  }
}

// ─────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────

/**
 * Validates eligibility and creates a customer return/exchange request.
 * Uses a DB unique returnNumber to prevent duplicates under concurrent load.
 */
export async function createReturnRequest(
  input: CreateReturnRequestInput
): Promise<ReturnRequest> {
  // 1. Order verification
  const order = await getOrderByNumber(input.orderNumber, undefined, true)
  if (!order) {
    throw new Error(`Sipariş bulunamadı: #${input.orderNumber}`)
  }

  // 2. Customer isolation
  if (input.userId && order.userId && order.userId !== input.userId) {
    throw new Error('Bu sipariş için iade talebi oluşturma yetkiniz bulunmuyor.')
  }

  // 3. Order status eligibility
  const eligibleStatuses = ['DELIVERED', 'SHIPPED', 'CONFIRMED']
  if (!eligibleStatuses.includes(order.status)) {
    throw new Error(
      `Sipariş durumu (${order.status}) iade/değişim oluşturmak için uygun değildir. Yalnızca teslim edilmiş veya sevk edilmiş siparişler iade edilebilir.`
    )
  }

  // 4. Return window check
  const orderDate = new Date(order.updatedAt || order.createdAt).getTime()
  const daysSinceOrder = (Date.now() - orderDate) / (1000 * 60 * 60 * 24)
  if (daysSinceOrder > DEFAULT_RETURN_WINDOW_DAYS) {
    throw new Error(
      `Yasal iade süresi (${DEFAULT_RETURN_WINDOW_DAYS} gün) aşılmıştır. Sipariş tarihi üzerinden ${Math.floor(daysSinceOrder)} gün geçti.`
    )
  }

  // 5. Items validation
  if (!input.items || input.items.length === 0) {
    throw new Error('İade edilecek en az bir ürün seçilmelidir.')
  }

  // 6. Duplicate / active return check
  let existingOrderReturns: ReturnRequest[] = []
  if (isDatabaseConfigured) {
    try {
      const existing = await (db.orm.public.ReturnRequest as any).findMany({
        where: {
          orderId: order.id,
          status: { notIn: ['REJECTED', 'CANCELLED'] },
        },
        include: { items: true },
      })
      existingOrderReturns = existing.map(mapDbReturnToInterface)
    } catch (err) {
      console.warn('[returns.service] Could not check existing returns in DB:', err)
    }
  } else {
    existingOrderReturns = _devMemoryReturns.filter(
      (r) => r.orderNumber === order.orderNumber && r.status !== 'REJECTED' && r.status !== 'CANCELLED'
    )
  }

  const activeExisting = existingOrderReturns.find((r) =>
    ['REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'RETURN_SHIPPING_CREATED', 'IN_TRANSIT'].includes(r.status)
  )
  if (activeExisting) {
    throw new Error(
      `Bu sipariş için zaten devam eden aktif bir iade/değişim talebi bulunmaktadır (#${activeExisting.returnNumber}).`
    )
  }

  // 7. Items quantity validation and refund calculation
  const returnItems: Array<{
    orderItemId: string
    productId: string
    productName: string
    sku: string
    quantity: number
    unitPrice: number
    reason: string
    customerNote?: string
    replacementSku?: string
  }> = []
  let calculatedRefundTotal = 0

  for (const requestedItem of input.items) {
    if (requestedItem.quantity <= 0) {
      throw new Error(`Geçersiz iade adedi: ${requestedItem.quantity}. En az 1 adet seçilmelidir.`)
    }

    const orderItem = order.items.find(
      (oi: any) => oi.productId === requestedItem.productId || oi.sku === requestedItem.productId
    )
    if (!orderItem) {
      throw new Error(`Siparişte yer almayan ürün için iade talebi oluşturulamaz: ${requestedItem.productId}`)
    }

    // Check quantity against previously returned items
    let previouslyReturnedQty = 0
    existingOrderReturns.forEach((r) => {
      const match = r.items.find((ri) => ri.productId === orderItem.productId)
      if (match) previouslyReturnedQty += match.quantity
    })

    const maxReturnableQty = orderItem.quantity - previouslyReturnedQty
    if (requestedItem.quantity > maxReturnableQty) {
      throw new Error(
        `'${orderItem.productName}' için talep edilen adet (${requestedItem.quantity}) iade edilebilir maksimum adetten (${maxReturnableQty}) fazladır.`
      )
    }

    // Server-side calculated net refund with proportional discount
    const itemSubtotal = orderItem.unitPrice * requestedItem.quantity
    const discountRatio = order.subtotal > 0 ? (order.discountAmount || 0) / order.subtotal : 0
    const netItemRefund = Math.round(itemSubtotal * (1 - discountRatio) * 100) / 100
    calculatedRefundTotal += netItemRefund

    returnItems.push({
      orderItemId: (orderItem as any).id || orderItem.productId,
      productId: orderItem.productId,
      productName: orderItem.productName,
      sku: orderItem.sku,
      quantity: requestedItem.quantity,
      unitPrice: orderItem.unitPrice,
      reason: requestedItem.reason || input.reason,
      customerNote: requestedItem.customerNote || input.customerNote,
      replacementSku: requestedItem.replacementSku,
    })
  }

  // 8. Generate branded RMA number
  const returnSeq = (existingOrderReturns.length + 1).toString().padStart(2, '0')
  const cleanOrderNum = order.orderNumber.replace(/[^0-9]/g, '') || String(Date.now()).slice(-6)
  const returnNumber = `RMA-${cleanOrderNum}-${returnSeq}`
  const now = new Date()

  // 9. Persist to DB or dev fallback
  let newReturn: ReturnRequest

  if (isDatabaseConfigured) {
    try {
      const raw = await (db.orm.public.ReturnRequest as any).create({
        data: {
          returnNumber,
          orderId: order.id,
          userId: input.userId,
          type: input.type || 'RETURN',
          status: 'REQUESTED',
          reason: input.reason,
          customerNote: input.customerNote,
          photoUrls: input.photos ?? [],
          refundAmount: calculatedRefundTotal,
          refundStatus: 'PENDING',
          requestedAt: now,
          items: {
            create: returnItems.map((ri) => ({
              orderItemId: ri.orderItemId,
              productId: ri.productId,
              productName: ri.productName,
              sku: ri.sku,
              quantity: ri.quantity,
              unitPrice: ri.unitPrice,
              reason: ri.reason,
              customerNote: ri.customerNote,
              replacementSku: ri.replacementSku,
              restocked: false,
            })),
          },
          events: {
            create: [
              {
                status: 'REQUESTED',
                note: `İade talebi oluşturuldu: ${input.reason}`,
                createdBy: input.userId || 'customer',
                createdAt: now,
              },
            ],
          },
        },
        include: RETURN_INCLUDE,
      })
      newReturn = mapDbReturnToInterface(raw)
    } catch (err: any) {
      // Unique constraint violation = concurrent duplicate
      if (err?.code === 'P2002') {
        const existing = await _getReturnFromDb(returnNumber)
        if (existing) return existing
      }
      throw err
    }
  } else {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DATABASE_CONFIGURATION_ERROR: DATABASE_URL must be configured in production.')
    }
    // Dev-only in-memory fallback
    const returnId = `ret-${Date.now()}-${Math.floor(Math.random() * 1000)}`
    const devItems: ReturnItem[] = returnItems.map((ri, idx) => ({
      id: `ritm-${Date.now()}-${idx}`,
      returnRequestId: returnId,
      orderItemId: ri.orderItemId,
      productId: ri.productId,
      productName: ri.productName,
      sku: ri.sku,
      quantity: ri.quantity,
      unitPrice: ri.unitPrice,
      reason: ri.reason,
      customerNote: ri.customerNote,
      restocked: false,
    }))
    const devEvent: ReturnEventRecord = {
      id: `rev-${Date.now()}`,
      returnRequestId: returnId,
      status: 'REQUESTED',
      note: `İade talebi oluşturuldu: ${input.reason}`,
      createdAt: now.toISOString(),
      createdBy: input.userId || 'customer',
    }
    newReturn = {
      id: returnId,
      returnNumber,
      orderId: order.id || order.orderNumber,
      orderNumber: order.orderNumber,
      userId: input.userId,
      customerName: order.shippingAddressSnapshot?.fullName || 'Değerli Müşterimiz',
      customerEmail: order.customerEmail || '',
      type: input.type || 'RETURN',
      status: 'REQUESTED',
      reason: input.reason,
      customerNote: input.customerNote,
      items: devItems,
      shipment: null,
      refundAmount: calculatedRefundTotal,
      refundStatus: 'PENDING',
      photos: input.photos || [],
      photoUrls: input.photos || [],
      requestedAt: now.toISOString(),
      events: [devEvent],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }
    _devMemoryReturns.unshift(newReturn)
  }

  // 10. Update order status
  if (order.status === 'DELIVERED') {
    await updateOrderStatus(
      order.orderNumber,
      'RETURN_REQUESTED',
      `İade talebi oluşturuldu (${returnNumber})`,
      input.userId || 'customer'
    ).catch(() => {})
  }

  // 11. Audit log
  await logAuditEvent({
    action: 'RETURN_CREATED',
    entity: 'ReturnRequest',
    entityId: returnNumber,
    userId: input.userId,
    metadata: {
      orderNumber: order.orderNumber,
      type: input.type,
      itemCount: returnItems.length,
      refundAmount: calculatedRefundTotal,
      reason: input.reason,
    },
  }).catch(() => {})

  // 12. Notification (non-blocking)
  createNotification({
    orderNumber: order.orderNumber,
    eventType: 'RETURN_REQUESTED',
    recipientEmail: newReturn.customerEmail,
    metadata: {
      returnNumber,
      returnReason: input.reason,
      refundAmount: calculatedRefundTotal,
    },
  }).catch((err) => {
    console.warn('[returns.service] Error sending RETURN_REQUESTED notification:', err)
  })

  return newReturn
}

/**
 * Retrieves a return request by RMA number with optional user ownership isolation.
 */
export async function getReturnRequestByNumber(
  returnNumber: string,
  userId?: string
): Promise<ReturnRequest | null> {
  const returnReq = await _getReturnFromDb(returnNumber)
  if (!returnReq) return null

  if (userId && returnReq.userId && returnReq.userId !== userId) {
    throw new Error('Bu iade talebine erişim yetkiniz bulunmuyor.')
  }

  return returnReq
}

/**
 * Retrieves all return requests for a specific order.
 */
export async function getReturnsByOrderNumber(
  orderNumber: string,
  userId?: string
): Promise<ReturnRequest[]> {
  if (isDatabaseConfigured) {
    try {
      const order = await getOrderByNumber(orderNumber, undefined, false)
      if (!order) return []

      const where: any = { orderId: order.id }
      if (userId) where.userId = userId

      const results = await (db.orm.public.ReturnRequest as any).findMany({
        where,
        include: RETURN_INCLUDE,
        orderBy: { createdAt: 'desc' as const },
      })
      return results.map(mapDbReturnToInterface)
    } catch (err) {
      console.warn('[returns.service] DB error in getReturnsByOrderNumber:', err)
    }
  }

  let list = _devMemoryReturns.filter((r) => r.orderNumber === orderNumber)
  if (userId) list = list.filter((r) => r.userId === userId)
  return list
}

/**
 * Admin: queries all return requests with filters.
 */
export async function getAllReturns(filters?: {
  status?: ReturnStatus
  type?: string
  search?: string
}): Promise<ReturnRequest[]> {
  if (isDatabaseConfigured) {
    try {
      const where: any = {}
      if (filters?.status) where.status = filters.status
      if (filters?.type) where.type = filters.type
      if (filters?.search) {
        const q = filters.search
        where.OR = [
          { returnNumber: { contains: q, mode: 'insensitive' } },
          { order: { orderNumber: { contains: q, mode: 'insensitive' } } },
          { user: { email: { contains: q, mode: 'insensitive' } } },
          { user: { name: { contains: q, mode: 'insensitive' } } },
        ]
      }

      const results = await (db.orm.public.ReturnRequest as any).findMany({
        where,
        include: RETURN_INCLUDE,
        orderBy: { createdAt: 'desc' as const },
      })
      return results.map(mapDbReturnToInterface)
    } catch (err) {
      console.warn('[returns.service] DB error in getAllReturns:', err)
    }
  }

  let list = [..._devMemoryReturns]
  if (filters?.status) list = list.filter((r) => r.status === filters.status)
  if (filters?.type) list = list.filter((r) => r.type === filters.type)
  if (filters?.search) {
    const q = filters.search.toLowerCase()
    list = list.filter(
      (r) =>
        r.returnNumber.toLowerCase().includes(q) ||
        r.orderNumber.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q) ||
        r.customerEmail.toLowerCase().includes(q)
    )
  }
  return list
}

/**
 * Admin: approves return request.
 */
export async function approveReturnRequest(
  arg1:
    | string
    | { returnNumber: string; adminUserId?: string; note?: string; autoGenerateShipping?: boolean; provider?: string },
  adminUserId?: string,
  note?: string
): Promise<ReturnRequest> {
  const params =
    typeof arg1 === 'string'
      ? { returnNumber: arg1, adminUserId, note, autoGenerateShipping: false }
      : arg1

  const returnReq = await _getReturnFromDb(params.returnNumber)
  if (!returnReq) throw new Error(`İade talebi bulunamadı: ${params.returnNumber}`)

  assertValidReturnTransition(returnReq.status, 'APPROVED')

  const now = new Date()

  if (isDatabaseConfigured) {
    await (db.orm.public.ReturnRequest as any).update({
      where: { returnNumber: params.returnNumber },
      data: {
        status: 'APPROVED',
        approvedAt: now,
        adminNote: params.note,
        updatedAt: now,
        events: {
          create: {
            status: 'APPROVED',
            note: params.note || 'İade talebi onaylandı.',
            createdBy: params.adminUserId || 'admin',
            createdAt: now,
          },
        },
      },
    })
  } else {
    returnReq.status = 'APPROVED'
    returnReq.approvedAt = now.toISOString()
    returnReq.updatedAt = now.toISOString()
    if (params.note) returnReq.adminNote = params.note
    returnReq.events.push({
      id: `rev-${Date.now()}`,
      returnRequestId: returnReq.id,
      status: 'APPROVED',
      note: params.note || 'İade talebi onaylandı.',
      createdAt: now.toISOString(),
      createdBy: params.adminUserId || 'admin',
    })
  }

  if (params.autoGenerateShipping) {
    await createReturnShipmentForReturn({
      returnNumber: params.returnNumber,
      provider: params.provider,
      adminUserId: params.adminUserId,
    }).catch((err) => console.warn('[returns] auto-shipping failed:', err))
  }

  await logAuditEvent({
    action: 'RETURN_APPROVED',
    entity: 'ReturnRequest',
    entityId: params.returnNumber,
    userId: params.adminUserId,
    metadata: { note: params.note },
  }).catch(() => {})

  const updated = await _getReturnFromDb(params.returnNumber)

  createNotification({
    orderNumber: updated?.orderNumber ?? returnReq.orderNumber,
    eventType: 'RETURN_APPROVED',
    recipientEmail: updated?.customerEmail ?? returnReq.customerEmail,
    metadata: {
      returnNumber: params.returnNumber,
      trackingNumber: updated?.shipment?.trackingNumber,
      carrier: updated?.shipment?.provider,
    },
  }).catch(() => {})

  return updated ?? { ...returnReq, status: 'APPROVED', approvedAt: now.toISOString() }
}

/**
 * Admin: rejects return request.
 */
export async function rejectReturnRequest(
  arg1: string | { returnNumber: string; reason: string; adminUserId?: string },
  reason?: string,
  adminUserId?: string
): Promise<ReturnRequest> {
  const params =
    typeof arg1 === 'string'
      ? { returnNumber: arg1, reason: reason || '', adminUserId }
      : arg1

  const returnReq = await _getReturnFromDb(params.returnNumber)
  if (!returnReq) throw new Error(`İade talebi bulunamadı: ${params.returnNumber}`)

  assertValidReturnTransition(returnReq.status, 'REJECTED')

  const now = new Date()

  if (isDatabaseConfigured) {
    await (db.orm.public.ReturnRequest as any).update({
      where: { returnNumber: params.returnNumber },
      data: {
        status: 'REJECTED',
        rejectedAt: now,
        adminNote: params.reason,
        updatedAt: now,
        events: {
          create: {
            status: 'REJECTED',
            note: `İade talebi reddedildi: ${params.reason}`,
            createdBy: params.adminUserId || 'admin',
            createdAt: now,
          },
        },
      },
    })
  } else {
    returnReq.status = 'REJECTED'
    returnReq.rejectedAt = now.toISOString()
    returnReq.updatedAt = now.toISOString()
    returnReq.adminNote = params.reason
    returnReq.events.push({
      id: `rev-${Date.now()}`,
      returnRequestId: returnReq.id,
      status: 'REJECTED',
      note: `İade talebi reddedildi: ${params.reason}`,
      createdAt: now.toISOString(),
      createdBy: params.adminUserId || 'admin',
    })
  }

  await logAuditEvent({
    action: 'RETURN_REJECTED',
    entity: 'ReturnRequest',
    entityId: params.returnNumber,
    userId: params.adminUserId,
    metadata: { reason: params.reason },
  }).catch(() => {})

  const updated = await _getReturnFromDb(params.returnNumber)

  createNotification({
    orderNumber: updated?.orderNumber ?? returnReq.orderNumber,
    eventType: 'RETURN_REJECTED',
    recipientEmail: updated?.customerEmail ?? returnReq.customerEmail,
    metadata: {
      returnNumber: params.returnNumber,
      cancellationReason: params.reason,
    },
  }).catch(() => {})

  return updated ?? { ...returnReq, status: 'REJECTED', rejectedAt: now.toISOString() }
}

/**
 * Creates return shipping via active ReturnShippingProvider.
 * DB-level unique constraint on returnRequestId prevents duplicate shipments.
 */
export async function createReturnShipmentForReturn(params: {
  returnNumber: string
  provider?: string
  adminUserId?: string
}): Promise<ReturnShipmentRecord> {
  const returnReq = await _getReturnFromDb(params.returnNumber)
  if (!returnReq) throw new Error(`İade talebi bulunamadı: ${params.returnNumber}`)

  // Idempotency: Unique constraint at DB level also prevents this
  if (returnReq.shipment?.trackingNumber) {
    throw new Error(
      `Bu iade talebi için iade kargo kaydı zaten oluşturulmuş (${returnReq.shipment.trackingNumber}).`
    )
  }

  const order = await getOrderByNumber(returnReq.orderNumber, undefined, true)
  const address = order?.shippingAddressSnapshot || {
    fullName: returnReq.customerName,
    phone: '05550000000',
    addressLine: 'Müşteri Adresi',
    city: 'İstanbul',
    district: 'Kadıköy',
    postalCode: '34710',
  }

  const returnProvider = getReturnShippingProvider(params.provider)
  let shipmentResult: any

  if (returnProvider.createReturnShipment) {
    shipmentResult = await returnProvider.createReturnShipment({
      returnNumber: returnReq.returnNumber,
      orderNumber: returnReq.orderNumber,
      customerName: returnReq.customerName,
      customerPhone: (address as any).phone || '05550000000',
      pickupAddress: {
        addressLine: (address as any).addressLine,
        city: (address as any).city,
        district: (address as any).district || (address as any).city,
        postalCode: (address as any).postalCode || '34000',
        country: (address as any).country || 'TR',
      },
      items: returnReq.items.map((i) => ({ productName: i.productName, sku: i.sku, quantity: i.quantity })),
      packageCount: 1,
    })
  } else {
    shipmentResult = await returnProvider.createShipment({
      orderNumber: returnReq.returnNumber,
      customerName: returnReq.customerName,
      customerPhone: (address as any).phone || '05550000000',
      shippingAddress: {
        addressLine: (address as any).addressLine,
        city: (address as any).city,
        district: (address as any).district || (address as any).city,
        postalCode: (address as any).postalCode || '34000',
      },
      items: returnReq.items.map((i) => ({ productName: i.productName, sku: i.sku, quantity: i.quantity })),
      packageCount: 1,
    })
  }

  const now = new Date()
  let shipmentRecord: ReturnShipmentRecord

  if (isDatabaseConfigured) {
    try {
      const raw = await (db.orm.public.ReturnShipment as any).create({
        data: {
          returnRequestId: returnReq.id,
          provider: returnProvider.providerName,
          trackingNumber: shipmentResult.trackingNumber,
          trackingUrl: shipmentResult.trackingUrl,
          labelData: shipmentResult.labelData,
          labelFormat: shipmentResult.labelFormat,
          status: shipmentResult.status || 'LABEL_CREATED',
        },
      })
      shipmentRecord = mapDbReturnShipmentToInterface(raw)

      // Update return status
      await (db.orm.public.ReturnRequest as any).update({
        where: { returnNumber: params.returnNumber },
        data: {
          status: 'RETURN_SHIPPING_CREATED',
          updatedAt: now,
          events: {
            create: {
              status: 'RETURN_SHIPPING_CREATED',
              note: `İade kargo barkodu oluşturuldu (${returnProvider.providerName}: ${shipmentResult.trackingNumber})`,
              createdBy: params.adminUserId || 'system',
              createdAt: now,
            },
          },
        },
      })
    } catch (err: any) {
      // Unique constraint = already created
      if (err?.code === 'P2002') {
        const refreshed = await _getReturnFromDb(params.returnNumber)
        if (refreshed?.shipment) return refreshed.shipment
      }
      throw err
    }
  } else {
    const shipId = `rshp-${Date.now()}`
    shipmentRecord = {
      id: shipId,
      returnRequestId: returnReq.id,
      provider: returnProvider.providerName,
      trackingNumber: shipmentResult.trackingNumber,
      trackingUrl: shipmentResult.trackingUrl,
      labelData: shipmentResult.labelData,
      status: shipmentResult.status || 'LABEL_CREATED',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }
    returnReq.shipment = shipmentRecord
    returnReq.status = 'RETURN_SHIPPING_CREATED'
    returnReq.updatedAt = now.toISOString()
    returnReq.events.push({
      id: `rev-${Date.now()}`,
      returnRequestId: returnReq.id,
      status: 'RETURN_SHIPPING_CREATED',
      note: `İade kargo barkodu oluşturuldu (${returnProvider.providerName}: ${shipmentResult.trackingNumber})`,
      createdAt: now.toISOString(),
      createdBy: params.adminUserId || 'system',
    })
  }

  await logAuditEvent({
    action: 'RETURN_SHIPMENT_CREATED',
    entity: 'ReturnRequest',
    entityId: returnReq.returnNumber,
    userId: params.adminUserId,
    metadata: { provider: returnProvider.providerName, trackingNumber: shipmentResult.trackingNumber },
  }).catch(() => {})

  createNotification({
    orderNumber: returnReq.orderNumber,
    eventType: 'RETURN_SHIPMENT_CREATED',
    recipientEmail: returnReq.customerEmail,
    metadata: {
      returnNumber: returnReq.returnNumber,
      carrier: returnProvider.providerName,
      trackingNumber: shipmentResult.trackingNumber,
      trackingUrl: shipmentResult.trackingUrl,
    },
  }).catch(() => {})

  return shipmentRecord
}

/**
 * Admin: records that the returned package was physically received.
 */
export async function receiveReturnPackage(
  arg1: string | { returnNumber: string; adminUserId?: string; note?: string },
  adminUserId?: string,
  note?: string
): Promise<ReturnRequest> {
  const params = typeof arg1 === 'string' ? { returnNumber: arg1, adminUserId, note } : arg1

  const returnReq = await _getReturnFromDb(params.returnNumber)
  if (!returnReq) throw new Error(`İade talebi bulunamadı: ${params.returnNumber}`)

  assertValidReturnTransition(returnReq.status, 'RECEIVED')

  const now = new Date()

  if (isDatabaseConfigured) {
    await (db.orm.public.ReturnRequest as any).update({
      where: { returnNumber: params.returnNumber },
      data: {
        status: 'RECEIVED',
        receivedAt: now,
        updatedAt: now,
        events: {
          create: {
            status: 'RECEIVED',
            note: params.note || 'İade paketi lojistik merkezine teslim alındı.',
            createdBy: params.adminUserId || 'warehouse',
            createdAt: now,
          },
        },
      },
    })
  } else {
    returnReq.status = 'RECEIVED'
    returnReq.receivedAt = now.toISOString()
    returnReq.updatedAt = now.toISOString()
    returnReq.events.push({
      id: `rev-${Date.now()}`,
      returnRequestId: returnReq.id,
      status: 'RECEIVED',
      note: params.note || 'İade paketi lojistik merkezine teslim alındı.',
      createdAt: now.toISOString(),
      createdBy: params.adminUserId || 'warehouse',
    })
  }

  await updateOrderStatus(
    returnReq.orderNumber,
    'RETURNED',
    `İade paketi teslim alındı (${returnReq.returnNumber})`,
    params.adminUserId || 'warehouse'
  ).catch(() => {})

  await logAuditEvent({
    action: 'RETURN_RECEIVED',
    entity: 'ReturnRequest',
    entityId: params.returnNumber,
    userId: params.adminUserId,
    metadata: { note: params.note },
  }).catch(() => {})

  const updated = await _getReturnFromDb(params.returnNumber)

  createNotification({
    orderNumber: updated?.orderNumber ?? returnReq.orderNumber,
    eventType: 'RETURN_RECEIVED',
    recipientEmail: updated?.customerEmail ?? returnReq.customerEmail,
    metadata: { returnNumber: params.returnNumber },
  }).catch(() => {})

  return updated ?? { ...returnReq, status: 'RECEIVED', receivedAt: now.toISOString() }
}

export const receiveReturnAtWarehouse = receiveReturnPackage

/**
 * Admin: inspect returned items and record restock decisions.
 * Idempotent: each item can only be restocked once (DB flag).
 */
export async function inspectReturnItems(
  arg1:
    | string
    | {
        returnNumber: string
        items?: any[]
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
  resolutionsOrAdminId?: any,
  adminUserIdParam?: string
): Promise<ReturnRequest> {
  let params: {
    returnNumber: string
    itemResolutions: Array<{
      itemId: string
      condition: string
      inspectionResult: string
      resolution: ReturnInspectionResolution
      replacementSku?: string
    }>
    adminUserId?: string
    adminNote?: string
  }

  if (typeof arg1 === 'string') {
    params = {
      returnNumber: arg1,
      itemResolutions: Array.isArray(resolutionsOrAdminId) ? resolutionsOrAdminId : [],
      adminUserId: adminUserIdParam || (typeof resolutionsOrAdminId === 'string' ? resolutionsOrAdminId : undefined),
    }
  } else {
    const rawList = arg1.itemResolutions || arg1.items || []
    params = {
      returnNumber: arg1.returnNumber,
      itemResolutions: rawList.map((ri: any) => ({
        itemId: ri.orderItemId || ri.itemId || ri.productId,
        condition: ri.condition || 'USED',
        inspectionResult: ri.inspectionResult || 'PASSED',
        resolution: (ri.resolution as ReturnInspectionResolution) || 'RESTOCK',
        replacementSku: ri.replacementSku,
      })),
      adminUserId: arg1.adminUserId,
      adminNote: arg1.adminNote,
    }
  }

  const returnReq = await _getReturnFromDb(params.returnNumber)
  if (!returnReq) throw new Error(`İade talebi bulunamadı: ${params.returnNumber}`)

  assertValidReturnTransition(returnReq.status, 'INSPECTED')

  const now = new Date()

  for (const resolution of params.itemResolutions) {
    const item = returnReq.items.find(
      (ri) => ri.id === resolution.itemId || ri.productId === resolution.itemId || ri.orderItemId === resolution.itemId
    )

    if (!item) continue

    // Update item in DB
    if (isDatabaseConfigured && item.id) {
      await (db.orm.public.ReturnItem as any).update({
        where: { id: item.id },
        data: {
          condition: resolution.condition,
          inspectionResult: resolution.inspectionResult,
          resolution: resolution.resolution,
          replacementSku: resolution.replacementSku,
        },
      })
    }

    // Idempotent restock: check DB flag before restocking
    if (resolution.resolution === 'RESTOCK' && !item.restocked) {
      await restockProductInventory(
        item.productId,
        item.quantity,
        returnReq.returnNumber,
        params.adminUserId || 'inspection-team'
      )

      if (isDatabaseConfigured && item.id) {
        await (db.orm.public.ReturnItem as any).update({
          where: { id: item.id },
          data: { restocked: true, restockedAt: now },
        })
      } else {
        item.restocked = true
        item.restockedAt = now.toISOString()
      }
    }
  }

  if (isDatabaseConfigured) {
    await (db.orm.public.ReturnRequest as any).update({
      where: { returnNumber: params.returnNumber },
      data: {
        status: 'INSPECTED',
        inspectedAt: now,
        updatedAt: now,
        events: {
          create: {
            status: 'INSPECTED',
            note: `Ürün kalite kontrol incelemesi tamamlandı (${params.itemResolutions.length} ürün incelendi)`,
            createdBy: params.adminUserId || 'quality-control',
            createdAt: now,
          },
        },
      },
    })
  } else {
    returnReq.status = 'INSPECTED'
    returnReq.inspectedAt = now.toISOString()
    returnReq.updatedAt = now.toISOString()
    returnReq.events.push({
      id: `rev-${Date.now()}`,
      returnRequestId: returnReq.id,
      status: 'INSPECTED',
      note: `Ürün kalite kontrol incelemesi tamamlandı`,
      createdAt: now.toISOString(),
      createdBy: params.adminUserId || 'quality-control',
    })
  }

  await logAuditEvent({
    action: 'RETURN_INSPECTED',
    entity: 'ReturnRequest',
    entityId: params.returnNumber,
    userId: params.adminUserId,
    metadata: { resolutions: params.itemResolutions },
  }).catch(() => {})

  return (await _getReturnFromDb(params.returnNumber)) ?? returnReq
}

/**
 * Admin: processes customer refund. Idempotent — if already COMPLETED, returns current state.
 * Refund amount is always server-side calculated, never client-provided.
 */
export async function processRefundForReturn(
  arg1: string | { returnNumber: string; adminUserId?: string },
  adminUserIdParam?: string
): Promise<ReturnRequest> {
  const params = typeof arg1 === 'string' ? { returnNumber: arg1, adminUserId: adminUserIdParam } : arg1

  const returnReq = await _getReturnFromDb(params.returnNumber)
  if (!returnReq) throw new Error(`İade talebi bulunamadı: ${params.returnNumber}`)

  // Idempotency: already completed
  if (returnReq.refundStatus === 'COMPLETED') {
    return returnReq
  }

  assertValidReturnTransition(returnReq.status, 'REFUND_PENDING')

  const now = new Date()
  const refundRef = `REF-${Date.now()}-${Math.floor(Math.random() * 1000)}`

  if (isDatabaseConfigured) {
    await (db.orm.public.ReturnRequest as any).update({
      where: { returnNumber: params.returnNumber },
      data: {
        status: 'COMPLETED',
        refundStatus: 'COMPLETED',
        refundRef,
        completedAt: now,
        updatedAt: now,
        events: {
          create: {
            status: 'COMPLETED',
            note: `Para iadesi tamamlandı: ₺${returnReq.refundAmount} (Ref: ${refundRef})`,
            createdBy: params.adminUserId || 'finance',
            createdAt: now,
          },
        },
      },
    })
  } else {
    returnReq.status = 'COMPLETED'
    returnReq.refundStatus = 'COMPLETED'
    returnReq.refundRef = refundRef
    returnReq.completedAt = now.toISOString()
    returnReq.updatedAt = now.toISOString()
    returnReq.events.push({
      id: `rev-${Date.now()}`,
      returnRequestId: returnReq.id,
      status: 'COMPLETED',
      note: `Para iadesi tamamlandı: ₺${returnReq.refundAmount} (Ref: ${refundRef})`,
      createdAt: now.toISOString(),
      createdBy: params.adminUserId || 'finance',
    })
  }

  await updateOrderStatus(
    returnReq.orderNumber,
    'PARTIALLY_REFUNDED',
    `İade tutarı ödendi (₺${returnReq.refundAmount})`,
    params.adminUserId || 'finance'
  ).catch(() => {})

  await logAuditEvent({
    action: 'RETURN_REFUND_COMPLETED',
    entity: 'ReturnRequest',
    entityId: params.returnNumber,
    userId: params.adminUserId,
    metadata: { refundAmount: returnReq.refundAmount, refundRef },
  }).catch(() => {})

  const updated = await _getReturnFromDb(params.returnNumber)

  createNotification({
    orderNumber: updated?.orderNumber ?? returnReq.orderNumber,
    eventType: 'REFUND_ISSUED',
    recipientEmail: updated?.customerEmail ?? returnReq.customerEmail,
    metadata: {
      returnNumber: params.returnNumber,
      refundAmount: returnReq.refundAmount,
    },
  }).catch(() => {})

  return updated ?? returnReq
}

/**
 * Admin: processes exchange. Server-side stock check before completing.
 */
export async function processExchangeForReturn(
  arg1:
    | string
    | {
        returnNumber: string
        replacementProductId?: string
        replacementQuantity?: number
        replacementSku?: string
        adminUserId?: string
      },
  adminUserIdParam?: string
): Promise<ReturnRequest> {
  const params = typeof arg1 === 'string' ? { returnNumber: arg1, adminUserId: adminUserIdParam } : arg1

  const returnReq = await _getReturnFromDb(params.returnNumber)
  if (!returnReq) throw new Error(`İade talebi bulunamadı: ${params.returnNumber}`)

  assertValidReturnTransition(returnReq.status, 'EXCHANGE_PENDING')

  const productIdToCheck = params.replacementProductId || returnReq.items[0]?.productId
  const quantityNeeded = params.replacementQuantity || returnReq.items[0]?.quantity || 1

  if (productIdToCheck) {
    const stockStatus = await getInventoryStatus(productIdToCheck)
    if (stockStatus.available < quantityNeeded) {
      throw new Error(
        `Değişim ürünü stokta bulunmuyor (Mevcut stok: ${stockStatus.available}, Talep: ${quantityNeeded}).`
      )
    }
  }

  const now = new Date()
  const exchangeOrderNumber = `EXC-${returnReq.orderNumber}-${Date.now().toString().slice(-4)}`

  if (isDatabaseConfigured) {
    await (db.orm.public.ReturnRequest as any).update({
      where: { returnNumber: params.returnNumber },
      data: {
        status: 'COMPLETED',
        exchangeOrderId: exchangeOrderNumber,
        completedAt: now,
        updatedAt: now,
        events: {
          create: {
            status: 'COMPLETED',
            note: `Değişim siparişi oluşturuldu: #${exchangeOrderNumber}`,
            createdBy: params.adminUserId || 'exchange-desk',
            createdAt: now,
          },
        },
      },
    })
  } else {
    returnReq.status = 'COMPLETED'
    returnReq.exchangeOrderNumber = exchangeOrderNumber
    returnReq.replacementOrderNumber = exchangeOrderNumber
    returnReq.completedAt = now.toISOString()
    returnReq.updatedAt = now.toISOString()
    returnReq.events.push({
      id: `rev-${Date.now()}`,
      returnRequestId: returnReq.id,
      status: 'COMPLETED',
      note: `Değişim siparişi oluşturuldu: #${exchangeOrderNumber}`,
      createdAt: now.toISOString(),
      createdBy: params.adminUserId || 'exchange-desk',
    })
  }

  await logAuditEvent({
    action: 'RETURN_EXCHANGE_CREATED',
    entity: 'ReturnRequest',
    entityId: params.returnNumber,
    userId: params.adminUserId,
    metadata: { exchangeOrderNumber },
  }).catch(() => {})

  const updated = await _getReturnFromDb(params.returnNumber)

  createNotification({
    orderNumber: updated?.orderNumber ?? returnReq.orderNumber,
    eventType: 'EXCHANGE_COMPLETED',
    recipientEmail: updated?.customerEmail ?? returnReq.customerEmail,
    metadata: { returnNumber: params.returnNumber, orderNumber: exchangeOrderNumber },
  }).catch(() => {})

  return updated ?? returnReq
}

/**
 * Customer: cancels return request before items are shipped.
 */
export async function cancelReturnRequest(params: {
  returnNumber: string
  userId: string
  reason?: string
}): Promise<ReturnRequest> {
  const returnReq = await _getReturnFromDb(params.returnNumber)
  if (!returnReq) throw new Error(`İade talebi bulunamadı: ${params.returnNumber}`)

  if (returnReq.userId && returnReq.userId !== params.userId) {
    throw new Error('Bu iade talebini iptal etme yetkiniz bulunmuyor.')
  }

  if (['IN_TRANSIT', 'RECEIVED', 'COMPLETED'].includes(returnReq.status)) {
    throw new Error(`'${returnReq.status}' durumundaki iade talebi iptal edilemez.`)
  }

  const now = new Date()

  if (isDatabaseConfigured) {
    await (db.orm.public.ReturnRequest as any).update({
      where: { returnNumber: params.returnNumber },
      data: {
        status: 'CANCELLED',
        updatedAt: now,
        events: {
          create: {
            status: 'CANCELLED',
            note: params.reason || 'Müşteri talebiyle iade iptal edildi.',
            createdBy: params.userId,
            createdAt: now,
          },
        },
      },
    })
  } else {
    returnReq.status = 'CANCELLED'
    returnReq.updatedAt = now.toISOString()
    returnReq.events.push({
      id: `rev-${Date.now()}`,
      returnRequestId: returnReq.id,
      status: 'CANCELLED',
      note: params.reason || 'Müşteri talebiyle iade iptal edildi.',
      createdAt: now.toISOString(),
      createdBy: params.userId,
    })
  }

  await logAuditEvent({
    action: 'RETURN_CANCELLED',
    entity: 'ReturnRequest',
    entityId: params.returnNumber,
    userId: params.userId,
    metadata: { reason: params.reason },
  }).catch(() => {})

  return (await _getReturnFromDb(params.returnNumber)) ?? returnReq
}

/**
 * Server-side calculation of refund amount based on order items.
 * Client-provided amounts are never trusted.
 */
export async function calculateOrderRefundAmount(
  orderNumber: string,
  items: Array<{ orderItemId?: string; productId?: string; quantity: number }>
): Promise<{ refundAmount: number; itemCount: number }> {
  const order = await getOrderByNumber(orderNumber, undefined, true)
  if (!order) throw new Error(`Sipariş bulunamadı: #${orderNumber}`)

  let refundAmount = 0
  let itemCount = 0

  for (const item of items) {
    const orderItem = order.items.find(
      (oi: any) =>
        (item.orderItemId &&
          (oi.id === item.orderItemId || oi.productId === item.orderItemId || oi.sku === item.orderItemId)) ||
        (item.productId && (oi.productId === item.productId || oi.sku === item.productId))
    )
    if (!orderItem) throw new Error(`Sipariş öğesi bulunamadı: ${item.orderItemId || item.productId}`)
    const qty = Math.min(orderItem.quantity, item.quantity)
    refundAmount += orderItem.unitPrice * qty
    itemCount += qty
  }

  return { refundAmount, itemCount }
}

// Aliases for backward compat
export const createReturnShipment = createReturnShipmentForReturn
export const inspectReturnRequest = inspectReturnItems
export const getReturnRequestsByOrder = getReturnsByOrderNumber
export const getAllReturnRequests = getAllReturns
