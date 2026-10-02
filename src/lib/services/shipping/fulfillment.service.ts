import 'server-only'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { getOrderByNumber, updateOrderStatus } from '../orders.service'
import { logAuditEvent } from '../admin.service'
import { getShippingProvider } from './shipping-provider.factory'
import { verifyCarrierWebhook } from './webhook-signature'
import { createNotification } from '../notification/notification.service'
import type {
  StoredShipment,
  ShipmentStatus,
  ShipmentEvent,
  TrackingResult,
  ShippingLabelResult,
} from './shipping.interface'

// ─────────────────────────────────────────────────────────────
// DEV-ONLY IN-MEMORY FALLBACK
// Used strictly when DATABASE_URL is not set (local dev / test).
// In production, all state lives in PostgreSQL.
// ─────────────────────────────────────────────────────────────
const _devMemoryShipments: StoredShipment[] = []

// ─────────────────────────────────────────────────────────────
// DB ↔ Domain mapper
// ─────────────────────────────────────────────────────────────

function mapDbShipmentToInterface(raw: any, orderNumber: string): StoredShipment {
  const statusMap: Record<string, ShipmentStatus> = {
    PENDING: 'LABEL_CREATED',
    PICKED_UP: 'SHIPPED',
    IN_TRANSIT: 'IN_TRANSIT',
    OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
    DELIVERED: 'DELIVERED',
    FAILED: 'DELIVERY_FAILED',
    RETURNED: 'RETURNED',
  }

  return {
    id: raw.id,
    orderId: raw.orderId,
    orderNumber,
    provider: raw.provider || 'MOCK',
    providerShipmentId: raw.providerShipmentId || raw.trackingNumber || raw.id,
    trackingNumber: raw.trackingNumber || `MOCK-${raw.id.slice(-6)}`,
    trackingUrl: raw.trackingUrl || '',
    status: (statusMap[raw.status] ?? raw.status) as ShipmentStatus,
    labelData: raw.labelData ?? undefined,
    labelFormat: (raw.labelFormat as any) ?? 'PDF',
    shippedAt: raw.shippedAt?.toISOString() ?? null,
    deliveredAt: raw.deliveredAt?.toISOString() ?? null,
    cancelledAt: raw.cancelledAt?.toISOString() ?? null,
    notes: raw.notes ?? null,
    events: (raw.events ?? []).map((e: any) => ({
      id: e.id,
      shipmentId: e.shipmentId,
      status: e.status as ShipmentStatus,
      description: e.description,
      location: e.location ?? undefined,
      eventAt: e.eventAt?.toISOString() ?? e.createdAt?.toISOString(),
      rawPayload: e.rawPayload ?? undefined,
      createdAt: e.createdAt?.toISOString(),
    })),
    createdAt: raw.createdAt?.toISOString(),
    updatedAt: raw.updatedAt?.toISOString(),
  }
}

// DB status from interface status
function toDbShipmentStatus(status: ShipmentStatus): string {
  const map: Record<ShipmentStatus, string> = {
    CREATED: 'PENDING',
    LABEL_CREATED: 'PENDING',
    READY_TO_SHIP: 'PENDING',
    SHIPPED: 'PICKED_UP',
    IN_TRANSIT: 'IN_TRANSIT',
    OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
    DELIVERED: 'DELIVERED',
    DELIVERY_FAILED: 'FAILED',
    RETURNED: 'RETURNED',
    CANCELLED: 'RETURNED', // closest enum value
  }
  return map[status] ?? 'PENDING'
}

// ─────────────────────────────────────────────────────────────
// LOOKUP HELPERS
// ─────────────────────────────────────────────────────────────

async function _findShipmentByOrderId(orderId: string, orderNumber: string): Promise<StoredShipment | null> {
  if (!isDatabaseConfigured) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DATABASE_CONFIGURATION_ERROR: DATABASE_URL must be configured in production.')
    }
    return _devMemoryShipments.find((s) => s.orderNumber === orderNumber) ?? null
  }
  try {
    const raw = await (db.orm.public.Shipment as any).findFirst({
      where: {
        orderId,
        status: { notIn: ['RETURNED'] },
      },
      include: { events: { orderBy: { eventAt: 'asc' as const } } },
      orderBy: { createdAt: 'desc' as const },
    })
    return raw ? mapDbShipmentToInterface(raw, orderNumber) : null
  } catch (err) {
    console.warn('[fulfillment.service] DB findShipmentByOrderId failed:', err)
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DATABASE_CONFIGURATION_ERROR: Failed to query database in production.')
    }
    return _devMemoryShipments.find((s) => s.orderNumber === orderNumber) ?? null
  }
}

async function _findShipmentByTrackingNumber(trackingNumber: string): Promise<{ shipment: StoredShipment; orderNumber: string } | null> {
  if (!isDatabaseConfigured) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DATABASE_CONFIGURATION_ERROR: DATABASE_URL must be configured in production.')
    }
    const s = _devMemoryShipments.find((x) => x.trackingNumber === trackingNumber)
    return s ? { shipment: s, orderNumber: s.orderNumber } : null
  }
  try {
    const raw = await (db.orm.public.Shipment as any).findFirst({
      where: { trackingNumber },
      include: {
        order: { select: { orderNumber: true } },
        events: { orderBy: { eventAt: 'asc' as const } },
      },
    })
    if (!raw) return null
    return {
      shipment: mapDbShipmentToInterface(raw, raw.order?.orderNumber ?? ''),
      orderNumber: raw.order?.orderNumber ?? '',
    }
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────
// CREATE SHIPMENT
// ─────────────────────────────────────────────────────────────

/**
 * Creates a fulfillment shipment for an order.
 * DB-level idempotency: unique constraint (orderId, provider) prevents duplicates.
 * In-flight Map is a last-resort guard for the same Node.js process only.
 */
const _inFlight = new Map<string, Promise<StoredShipment>>()

export async function createShipmentForOrder(params: {
  orderNumber: string
  packageCount?: number
  totalWeightKg?: number
  notes?: string
  requestedBy?: string
  provider?: string
}): Promise<StoredShipment> {
  const lockKey = params.orderNumber
  if (_inFlight.has(lockKey)) return _inFlight.get(lockKey)!
  const p = _executeCreateShipment(params)
  _inFlight.set(lockKey, p)
  try {
    return await p
  } finally {
    _inFlight.delete(lockKey)
  }
}

async function _executeCreateShipment(params: {
  orderNumber: string
  packageCount?: number
  totalWeightKg?: number
  notes?: string
  requestedBy?: string
  provider?: string
}): Promise<StoredShipment> {
  const order = await getOrderByNumber(params.orderNumber, undefined, true)
  if (!order) throw new Error(`Sipariş bulunamadı: #${params.orderNumber}`)

  // 1. State validation
  if (order.status === 'CANCELLED') {
    throw new Error('İptal edilmiş sipariş için kargo oluşturulamaz.')
  }

  const isEligible =
    order.status === 'CONFIRMED' ||
    order.status === 'PREPARING' ||
    order.status === 'IN_PRODUCTION' ||
    order.status === 'PACKING' ||
    order.status === 'SHIPPED' ||
    order.paymentStatus === 'PAID' ||
    order.paymentStatus === 'SUCCEEDED'

  if (!isEligible) {
    throw new Error(`Ödemesi onaylanmamış sipariş için kargo oluşturulamaz. (Durum: ${order.status})`)
  }

  // 2. Idempotency: DB-level check (primary)
  const existing = await _findShipmentByOrderId(order.id, order.orderNumber)
  if (existing && existing.status !== 'CANCELLED' && existing.status !== 'DELIVERY_FAILED') {
    await logAuditEvent({
      action: 'SHIPMENT_IDEMPOTENT_BYPASS',
      entity: 'Shipment',
      entityId: existing.id,
      metadata: { orderNumber: order.orderNumber, trackingNumber: existing.trackingNumber, source: 'DB' },
    }).catch(() => {})
    return existing
  }

  // 3. Address validation
  const address = order.shippingAddressSnapshot
  if (!address || !address.addressLine || !address.city || !address.fullName) {
    throw new Error('Geçerli teslimat adresi bulunamadığından kargo oluşturulamadı.')
  }

  // 4. Delegate to provider
  const provider = getShippingProvider(params.provider)
  const providerResult = await provider.createShipment({
    orderNumber: order.orderNumber,
    customerName: address.fullName,
    customerPhone: address.phone || '05550000000',
    shippingAddress: {
      addressLine: address.addressLine,
      city: address.city,
      district: address.district || address.city,
      postalCode: address.postalCode || '34000',
      country: address.country || 'TR',
    },
    items: order.items.map((i: any) => ({
      productName: i.productName,
      sku: i.sku,
      quantity: i.quantity,
    })),
    packageCount: params.packageCount || 1,
    totalWeightKg: params.totalWeightKg || 1,
    notes: params.notes,
  })

  const now = new Date()

  // 5. Persist to DB (primary) or dev memory (fallback)
  let newShipment: StoredShipment

  if (isDatabaseConfigured) {
    try {
      const created = await (db.orm.public.Shipment as any).create({
        data: {
          orderId: order.id,
          provider: provider.providerName,
          providerShipmentId: providerResult.providerShipmentId,
          trackingNumber: providerResult.trackingNumber,
          trackingUrl: providerResult.trackingUrl,
          status: 'PENDING',
          labelData: providerResult.labelData,
          labelFormat: providerResult.labelFormat,
          notes: params.notes,
          webhookDedupeKeys: [],
          events: {
            create: {
              status: 'PENDING',
              description: 'Kargo sevk kaydı oluşturuldu.',
              location: 'ZUULAB Atölye',
              eventAt: now,
            },
          },
        },
        include: { events: true },
      })
      newShipment = mapDbShipmentToInterface(created, order.orderNumber)
    } catch (err: any) {
      // Unique constraint (orderId, provider) = race condition duplicate
      if (err?.code === 'P2002') {
        const race = await _findShipmentByOrderId(order.id, order.orderNumber)
        if (race) return race
      }
      throw err
    }
  } else {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DATABASE_CONFIGURATION_ERROR: DATABASE_URL must be configured in production.')
    }
    const shipmentId = `shp-${Date.now()}-${Math.floor(Math.random() * 1000)}`
    const initialEvent: ShipmentEvent = {
      id: `ev-${Date.now()}`,
      shipmentId,
      status: providerResult.status,
      description: 'Kargo sevk kaydı oluşturuldu.',
      location: 'ZUULAB Atölye',
      eventAt: now.toISOString(),
      createdAt: now.toISOString(),
    }
    newShipment = {
      id: shipmentId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      provider: provider.providerName,
      providerShipmentId: providerResult.providerShipmentId,
      trackingNumber: providerResult.trackingNumber,
      trackingUrl: providerResult.trackingUrl,
      status: providerResult.status,
      labelData: providerResult.labelData,
      labelFormat: providerResult.labelFormat || 'PDF',
      shippedAt: null,
      deliveredAt: null,
      cancelledAt: null,
      notes: params.notes || null,
      events: [initialEvent],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }
    _devMemoryShipments.unshift(newShipment)
  }

  // 6. Advance order status
  if (order.status === 'CONFIRMED') {
    await updateOrderStatus(
      order.orderNumber,
      'PREPARING',
      `Kargo kaydı oluşturuldu (${provider.providerName}: ${newShipment.trackingNumber})`,
      params.requestedBy || 'system'
    ).catch(() => {})
  }

  // 7. Audit + notification
  await logAuditEvent({
    action: 'SHIPMENT_CREATED',
    entity: 'Shipment',
    entityId: newShipment.id,
    metadata: {
      orderNumber: order.orderNumber,
      provider: provider.providerName,
      trackingNumber: newShipment.trackingNumber,
      requestedBy: params.requestedBy,
    },
  }).catch(() => {})

  createNotification({
    orderNumber: order.orderNumber,
    eventType: 'SHIPMENT_CREATED',
    metadata: {
      carrier: provider.providerName,
      trackingNumber: newShipment.trackingNumber,
      trackingUrl: newShipment.trackingUrl,
    },
  }).catch(() => {})

  return newShipment
}

// ─────────────────────────────────────────────────────────────
// TRACKING
// ─────────────────────────────────────────────────────────────

export async function getTrackingInfo(params: {
  orderNumber: string
  userId?: string
  isAdmin?: boolean
}): Promise<{ shipment: StoredShipment; tracking: TrackingResult }> {
  const order = await getOrderByNumber(params.orderNumber, undefined, true)
  if (!order) throw new Error('Sipariş bulunamadı.')

  if (!params.isAdmin) {
    if (!params.userId || order.userId !== params.userId) {
      throw new Error('FORBIDDEN: Bu siparişin kargo bilgilerini görüntüleme yetkiniz bulunmamaktadır.')
    }
  }

  const shipment = await _findShipmentByOrderId(order.id, order.orderNumber)
  if (!shipment) throw new Error('Bu sipariş için henüz kargo kaydı oluşturulmamış.')

  const provider = getShippingProvider(shipment.provider)
  const tracking = await provider.getTracking(shipment.trackingNumber)

  // Sync state if provider has new status
  if (tracking.status && tracking.status !== shipment.status) {
    const prevStatus = shipment.status

    if (isDatabaseConfigured) {
      const updateData: any = {
        status: toDbShipmentStatus(tracking.status),
        updatedAt: new Date(),
      }
      if ((tracking.status === 'SHIPPED' || tracking.status === 'IN_TRANSIT') && !shipment.shippedAt) {
        updateData.shippedAt = new Date(tracking.lastEventAt || Date.now())
      }
      if (tracking.status === 'DELIVERED' && !shipment.deliveredAt) {
        updateData.deliveredAt = new Date(tracking.deliveredAt || tracking.lastEventAt || Date.now())
      }

      // Persist new events deduplicated
      const newEvents = (tracking.events || []).filter(
        (ev) => !shipment.events.some((e) => e.status === ev.status && e.description === ev.description)
      )

      await (db.orm.public.Shipment as any).update({
        where: { id: shipment.id },
        data: {
          ...updateData,
          events: {
            create: newEvents.map((ev) => ({
              status: ev.status,
              description: ev.description,
              location: ev.location,
              eventAt: new Date(ev.eventAt),
            })),
          },
        },
      })
      // Update in-memory view
      shipment.status = tracking.status
    } else {
      shipment.status = tracking.status
      shipment.updatedAt = new Date().toISOString()
    }

    // Order lifecycle transitions
    if (
      (tracking.status === 'SHIPPED' || tracking.status === 'IN_TRANSIT') &&
      !shipment.shippedAt
    ) {
      if (order.status === 'PREPARING' || order.status === 'PACKING' || order.status === 'CONFIRMED') {
        await updateOrderStatus(order.orderNumber, 'SHIPPED', `Kargo yola çıktı: ${shipment.trackingNumber}`, 'system').catch(() => {})
      }
    }
    if (tracking.status === 'DELIVERED' && !shipment.deliveredAt) {
      if (order.status === 'SHIPPED') {
        await updateOrderStatus(order.orderNumber, 'DELIVERED', 'Sipariş teslim edildi.', 'system').catch(() => {})
      }
    }

    if (tracking.status === 'OUT_FOR_DELIVERY' && prevStatus !== 'OUT_FOR_DELIVERY') {
      createNotification({
        orderNumber: order.orderNumber,
        eventType: 'OUT_FOR_DELIVERY',
        metadata: { carrier: shipment.provider, trackingNumber: shipment.trackingNumber },
      }).catch(() => {})
    }

    await logAuditEvent({
      action: 'SHIPMENT_TRACKING_UPDATED',
      entity: 'Shipment',
      entityId: shipment.id,
      metadata: { orderNumber: order.orderNumber, previousStatus: prevStatus, newStatus: tracking.status },
    }).catch(() => {})
  }

  return { shipment, tracking }
}

// ─────────────────────────────────────────────────────────────
// LABEL
// ─────────────────────────────────────────────────────────────

export async function getShipmentLabel(params: {
  orderNumber: string
  userId?: string
  isAdmin?: boolean
}): Promise<ShippingLabelResult> {
  const order = await getOrderByNumber(params.orderNumber, undefined, true)
  if (!order) throw new Error('Sipariş bulunamadı.')

  if (!params.isAdmin) {
    if (!params.userId || order.userId !== params.userId) {
      throw new Error('FORBIDDEN: Kargo etiketine erişim yetkiniz bulunmamaktadır.')
    }
  }

  const shipment = await _findShipmentByOrderId(order.id, order.orderNumber)
  if (!shipment) throw new Error('Kargo kaydı bulunamadı.')

  if (shipment.labelData) {
    return { labelData: shipment.labelData, labelFormat: shipment.labelFormat || 'PDF' }
  }

  const provider = getShippingProvider(shipment.provider)
  const labelRes = await provider.getLabel(shipment.trackingNumber)

  if (isDatabaseConfigured) {
    await (db.orm.public.Shipment as any).update({
      where: { id: shipment.id },
      data: { labelData: labelRes.labelData, labelFormat: labelRes.labelFormat },
    })
  } else {
    shipment.labelData = labelRes.labelData
    shipment.labelFormat = labelRes.labelFormat as any
  }

  await logAuditEvent({
    action: 'SHIPMENT_LABEL_GENERATED',
    entity: 'Shipment',
    entityId: shipment.id,
    metadata: { orderNumber: params.orderNumber, format: labelRes.labelFormat },
  }).catch(() => {})

  return labelRes
}

// ─────────────────────────────────────────────────────────────
// CANCEL
// ─────────────────────────────────────────────────────────────

export async function cancelShipmentForOrder(params: {
  orderNumber: string
  reason?: string
  requestedBy?: string
}): Promise<StoredShipment> {
  const order = await getOrderByNumber(params.orderNumber, undefined, true)
  if (!order) throw new Error('Sipariş bulunamadı.')

  const shipment = await _findShipmentByOrderId(order.id, order.orderNumber)
  if (!shipment) throw new Error('İptal edilecek kargo kaydı bulunamadı.')

  if (shipment.status === 'DELIVERED') throw new Error('Teslim edilmiş kargo iptal edilemez.')
  if (shipment.status === 'CANCELLED') return shipment

  const provider = getShippingProvider(shipment.provider)
  await provider.cancelShipment(shipment.trackingNumber)

  const now = new Date()

  if (isDatabaseConfigured) {
    await (db.orm.public.Shipment as any).update({
      where: { id: shipment.id },
      data: {
        status: 'RETURNED',
        cancelledAt: now,
        updatedAt: now,
        events: {
          create: {
            status: 'RETURNED',
            description: params.reason || 'Kargo gönderisi iptal edildi.',
            eventAt: now,
          },
        },
      },
    })
  } else {
    shipment.status = 'CANCELLED'
    shipment.cancelledAt = now.toISOString()
    shipment.updatedAt = now.toISOString()
    shipment.events.push({
      id: `ev-cancel-${Date.now()}`,
      shipmentId: shipment.id,
      status: 'CANCELLED',
      description: params.reason || 'Kargo gönderisi iptal edildi.',
      eventAt: now.toISOString(),
      createdAt: now.toISOString(),
    })
  }

  await logAuditEvent({
    action: 'SHIPMENT_CANCELLED',
    entity: 'Shipment',
    entityId: shipment.id,
    metadata: { orderNumber: params.orderNumber, reason: params.reason, requestedBy: params.requestedBy },
  }).catch(() => {})

  return { ...shipment, status: 'CANCELLED', cancelledAt: now.toISOString() }
}

// ─────────────────────────────────────────────────────────────
// WEBHOOK
// ─────────────────────────────────────────────────────────────

export async function handleShippingWebhook(params: {
  providerName: string
  payload: {
    trackingNumber: string
    status: ShipmentStatus
    description?: string
    location?: string
    timestamp?: string
    eventRef?: string
  }
  signature?: string
  rawBody?: string
}): Promise<{ success: boolean; message: string; shipmentId?: string }> {
  const provider = getShippingProvider(params.providerName)

  const verification = verifyCarrierWebhook({
    provider: params.providerName,
    rawBody: params.rawBody || '',
    signature: params.signature,
    providerVerifier: provider.verifyWebhookSignature?.bind(provider),
  })
  if (!verification.ok) {
    throw new Error(verification.reason)
  }

  const found = await _findShipmentByTrackingNumber(params.payload.trackingNumber)
  if (!found) return { success: false, message: 'İlgili kargo bulunamadı.' }

  const { shipment, orderNumber } = found

  // Dedup: use DB webhookDedupeKeys array
  const dedupeKey = params.payload.eventRef || `${params.payload.status}:${params.payload.timestamp || Date.now()}`

  if (isDatabaseConfigured) {
    try {
      const raw = await (db.orm.public.Shipment as any).findUnique({ where: { id: shipment.id } })
      const keys: string[] = raw?.webhookDedupeKeys ?? []
      if (keys.includes(dedupeKey)) {
        return { success: true, message: 'Event already processed', shipmentId: shipment.id }
      }

      const now = new Date(params.payload.timestamp || Date.now())
      await (db.orm.public.Shipment as any).update({
        where: { id: shipment.id },
        data: {
          status: toDbShipmentStatus(params.payload.status),
          updatedAt: new Date(),
          webhookDedupeKeys: [...keys, dedupeKey],
          events: {
            create: {
              status: params.payload.status,
              description: params.payload.description || `Kargo durumu: ${params.payload.status}`,
              location: params.payload.location,
              eventAt: now,
              rawPayload: params.payload as any,
            },
          },
        },
      })
    } catch (err) {
      console.warn('[fulfillment.service] Webhook DB update failed:', err)
    }
  } else {
    const isDuplicate = shipment.events.some(
      (e) => e.status === params.payload.status && e.description === (params.payload.description || '')
    )
    if (isDuplicate) return { success: true, message: 'Event already processed', shipmentId: shipment.id }

    const now = params.payload.timestamp || new Date().toISOString()
    shipment.status = params.payload.status
    shipment.updatedAt = new Date().toISOString()
    shipment.events.push({
      id: `ev-wh-${Date.now()}`,
      shipmentId: shipment.id,
      status: params.payload.status,
      description: params.payload.description || `Kargo durumu: ${params.payload.status}`,
      location: params.payload.location,
      eventAt: now,
      rawPayload: params.payload as any,
      createdAt: new Date().toISOString(),
    })
  }

  // Order lifecycle
  const order = await getOrderByNumber(orderNumber, undefined, true)
  if (order) {
    if (params.payload.status === 'SHIPPED' || params.payload.status === 'IN_TRANSIT') {
      if (order.status === 'PREPARING' || order.status === 'PACKING') {
        await updateOrderStatus(order.orderNumber, 'SHIPPED', 'Webhook: Kargo yola çıktı.', 'carrier-webhook').catch(() => {})
      }
    } else if (params.payload.status === 'OUT_FOR_DELIVERY') {
      createNotification({ orderNumber: order.orderNumber, eventType: 'OUT_FOR_DELIVERY', metadata: { carrier: shipment.provider, trackingNumber: shipment.trackingNumber } }).catch(() => {})
    } else if (params.payload.status === 'DELIVERED') {
      if (order.status === 'SHIPPED') {
        await updateOrderStatus(order.orderNumber, 'DELIVERED', 'Webhook: Teslimat tamamlandı.', 'carrier-webhook').catch(() => {})
      }
    }
  }

  await logAuditEvent({
    action: 'SHIPMENT_WEBHOOK_RECEIVED',
    entity: 'Shipment',
    entityId: shipment.id,
    metadata: { provider: params.providerName, trackingNumber: params.payload.trackingNumber, status: params.payload.status },
  }).catch(() => {})

  return { success: true, message: 'Kargo durumu güncellendi.', shipmentId: shipment.id }
}

// ─────────────────────────────────────────────────────────────
// SYNC (CRON / BATCH)
// ─────────────────────────────────────────────────────────────

export async function syncActiveShipmentsTracking(): Promise<{
  syncedCount: number
  updatedCount: number
  shipments: StoredShipment[]
}> {
  let activeShipments: StoredShipment[] = []

  if (isDatabaseConfigured) {
    try {
      const raws = await (db.orm.public.Shipment as any).findMany({
        where: { status: { notIn: ['DELIVERED', 'RETURNED', 'FAILED'] } },
        include: {
          order: { select: { orderNumber: true } },
          events: true,
        },
      })
      activeShipments = raws.map((r: any) => mapDbShipmentToInterface(r, r.order?.orderNumber ?? ''))
    } catch {}
  } else {
    activeShipments = _devMemoryShipments.filter(
      (s) => s.status !== 'DELIVERED' && s.status !== 'CANCELLED' && s.status !== 'RETURNED'
    )
  }

  let updatedCount = 0
  for (const shipment of activeShipments) {
    try {
      const prevStatus = shipment.status
      await getTrackingInfo({ orderNumber: shipment.orderNumber, isAdmin: true })
      if (shipment.status !== prevStatus) updatedCount++
    } catch (err) {
      console.warn(`[fulfillment.service] Error syncing tracking for #${shipment.orderNumber}:`, err)
    }
  }

  return { syncedCount: activeShipments.length, updatedCount, shipments: activeShipments }
}

// ─────────────────────────────────────────────────────────────
// ADMIN LIST / LOOKUP
// ─────────────────────────────────────────────────────────────

export async function getAllShipments(filters?: {
  status?: ShipmentStatus
  provider?: string
  search?: string
}): Promise<StoredShipment[]> {
  if (isDatabaseConfigured) {
    try {
      const where: any = {}
      if (filters?.status) where.status = toDbShipmentStatus(filters.status)
      if (filters?.provider) where.provider = { contains: filters.provider, mode: 'insensitive' }
      if (filters?.search) {
        where.OR = [
          { trackingNumber: { contains: filters.search, mode: 'insensitive' } },
          { order: { orderNumber: { contains: filters.search, mode: 'insensitive' } } },
        ]
      }

      const raws = await (db.orm.public.Shipment as any).findMany({
        where,
        include: {
          order: { select: { orderNumber: true } },
          events: { orderBy: { eventAt: 'asc' as const } },
        },
        orderBy: { createdAt: 'desc' as const },
      })
      return raws.map((r: any) => mapDbShipmentToInterface(r, r.order?.orderNumber ?? ''))
    } catch (err) {
      console.warn('[fulfillment.service] getAllShipments DB error:', err)
    }
  }

  let list = [..._devMemoryShipments]
  if (filters?.status) list = list.filter((s) => s.status === filters.status)
  if (filters?.provider) list = list.filter((s) => s.provider === filters.provider)
  if (filters?.search) {
    const q = filters.search.toLowerCase()
    list = list.filter((s) => s.orderNumber.toLowerCase().includes(q) || s.trackingNumber.toLowerCase().includes(q))
  }
  return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export async function getShipmentByOrderNumber(orderNumber: string): Promise<StoredShipment | null> {
  const order = await getOrderByNumber(orderNumber, undefined, false)
  if (!order) return null
  return _findShipmentByOrderId(order.id, orderNumber)
}

export async function getShipmentByTrackingNumber(trackingNumber: string): Promise<StoredShipment | null> {
  const found = await _findShipmentByTrackingNumber(trackingNumber)
  return found?.shipment ?? null
}
