import 'server-only'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { dbTimestampToIso, toDbTimestamp } from '@/lib/db/time'
import { getOrderByNumber, updateOrderStatus } from '../orders.service'
import { logAuditEvent } from '../admin.service'
import { getShippingProvider } from './shipping-provider.factory'
import { verifyCarrierWebhook } from './webhook-signature'
import { createNotification } from '../notification/notification.service'
import { markCashOnDeliveryCollected } from '../payment/payment.service'
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

// Shipments with their events (oldest first) and order number, through the Prisma 8 client
function shipmentQuery() {
  return db.orm.public.Shipment
    .include('events', (e) => e.orderBy((x) => x.eventAt.asc()))
    .include('order', (o) => o.select('orderNumber'))
}

type ShipmentRow = NonNullable<Awaited<ReturnType<ReturnType<typeof shipmentQuery>['first']>>>

function mapDbShipmentToInterface(raw: ShipmentRow, orderNumber?: string): StoredShipment {
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
    orderNumber: orderNumber || raw.order?.orderNumber || '',
    provider: raw.provider || 'MOCK',
    providerShipmentId: raw.providerShipmentId || raw.trackingNumber || raw.id,
    trackingNumber: raw.trackingNumber || `MOCK-${raw.id.slice(-6)}`,
    trackingUrl: raw.trackingUrl || '',
    // A cancelled shipment is stored as RETURNED with cancelledAt (the DB enum has no CANCELLED)
    status: raw.cancelledAt ? 'CANCELLED' : ((statusMap[raw.status] ?? raw.status) as ShipmentStatus),
    labelData: raw.labelData ?? undefined,
    labelFormat: (raw.labelFormat as StoredShipment['labelFormat']) ?? 'PDF',
    shippedAt: dbTimestampToIso(raw.shippedAt),
    deliveredAt: dbTimestampToIso(raw.deliveredAt),
    cancelledAt: dbTimestampToIso(raw.cancelledAt),
    notes: raw.notes ?? null,
    events: (raw.events ?? []).map((e) => ({
      id: e.id,
      shipmentId: e.shipmentId,
      status: e.status as ShipmentStatus,
      description: e.description,
      location: e.location ?? undefined,
      eventAt: dbTimestampToIso(e.eventAt) ?? dbTimestampToIso(e.createdAt) ?? '',
      rawPayload: (e.rawPayload ?? undefined) as Record<string, unknown> | undefined,
      createdAt: dbTimestampToIso(e.createdAt) ?? '',
    })),
    createdAt: dbTimestampToIso(raw.createdAt) ?? '',
    updatedAt: dbTimestampToIso(raw.updatedAt) ?? '',
  }
}

// DB status from interface status
function toDbShipmentStatus(status: ShipmentStatus): 'PENDING' | 'PICKED_UP' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED' | 'RETURNED' {
  const map = {
    CREATED: 'PENDING',
    LABEL_CREATED: 'PENDING',
    READY_TO_SHIP: 'PENDING',
    SHIPPED: 'PICKED_UP',
    IN_TRANSIT: 'IN_TRANSIT',
    OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
    DELIVERED: 'DELIVERED',
    DELIVERY_FAILED: 'FAILED',
    RETURNED: 'RETURNED',
    CANCELLED: 'RETURNED', // closest enum value; cancelledAt tells them apart
  } as const
  return map[status] ?? 'PENDING'
}

async function addShipmentEvents(
  shipmentId: string,
  events: Array<{ status: string; description: string; location?: string | null; eventAt: Date; rawPayload?: unknown }>
): Promise<void> {
  for (const ev of events) {
    await db.orm.public.ShipmentEvent.create({
      shipmentId,
      status: ev.status,
      description: ev.description,
      location: ev.location ?? null,
      eventAt: toDbTimestamp(ev.eventAt) as never,
      rawPayload: (ev.rawPayload ?? null) as never,
    })
  }
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
  const rows = await shipmentQuery()
    .where({ orderId })
    .orderBy((x) => x.createdAt.desc())
    .all()
  // The current shipment: newest one that is neither returned nor cancelled, else the newest
  const row = rows.find((r) => r.status !== 'RETURNED') ?? rows[0]
  return row ? mapDbShipmentToInterface(row, orderNumber) : null
}

async function _findShipmentByTrackingNumber(trackingNumber: string): Promise<{ shipment: StoredShipment; orderNumber: string } | null> {
  if (!isDatabaseConfigured) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DATABASE_CONFIGURATION_ERROR: DATABASE_URL must be configured in production.')
    }
    const s = _devMemoryShipments.find((x) => x.trackingNumber === trackingNumber)
    return s ? { shipment: s, orderNumber: s.orderNumber } : null
  }
  const raw = await shipmentQuery().where({ trackingNumber }).first()
  if (!raw) return null
  const shipment = mapDbShipmentToInterface(raw)
  return { shipment, orderNumber: shipment.orderNumber }
}

/** By the carrier's own id (Geliver shipment id; the tracking number for the others) */
export async function findShipmentByProviderShipmentId(providerShipmentId: string): Promise<StoredShipment | null> {
  if (!isDatabaseConfigured) return _devMemoryShipments.find((s) => s.providerShipmentId === providerShipmentId) ?? null
  const raw = await shipmentQuery().where({ providerShipmentId }).first()
  return raw ? mapDbShipmentToInterface(raw) : null
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

  // 4. Delegate to provider. Kapıda ödeme orders always go with PTT Kargo through
  // Geliver, which collects the order total at the door.
  const cod = order.paymentMethod === 'CASH_ON_DELIVERY'
  const provider = getShippingProvider(cod ? 'GELIVER' : params.provider)
  const providerResult = await provider.createShipment({
    orderNumber: order.orderNumber,
    customerName: address.fullName,
    customerPhone: address.phone || '05550000000',
    customerEmail: order.customerEmail || address.email,
    ...(cod ? { cashOnDeliveryAmount: order.totalAmount } : {}),
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
    const fields = {
      providerShipmentId: providerResult.providerShipmentId,
      trackingNumber: providerResult.trackingNumber,
      trackingUrl: providerResult.trackingUrl || null,
      status: 'PENDING' as const,
      labelData: providerResult.labelData ?? null,
      labelFormat: providerResult.labelFormat ?? null,
      notes: params.notes ?? null,
      shippedAt: null,
      deliveredAt: null,
      cancelledAt: null,
      webhookDedupeKeys: [] as string[],
      updatedAt: toDbTimestamp(now) as never,
    }
    // One row per order and carrier (unique index): a shipment created again after a
    // cancellation reuses the cancelled row
    const previous = await db.orm.public.Shipment.where({ orderId: order.id, provider: provider.providerName }).first()
    let shipmentId: string
    if (previous) {
      await db.orm.public.Shipment.where({ id: previous.id }).update(fields as never)
      shipmentId = previous.id
    } else {
      const created = await db.orm.public.Shipment.create({ orderId: order.id, provider: provider.providerName, ...fields } as never)
      shipmentId = (created as { id: string }).id
    }
    await addShipmentEvents(shipmentId, [
      { status: 'PENDING', description: cod ? 'Kapıda ödemeli PTT Kargo gönderisi oluşturuldu.' : 'Kargo sevk kaydı oluşturuldu.', location: 'ZUULAB Atölye', eventAt: now },
    ])
    const saved = await shipmentQuery().where({ id: shipmentId }).first()
    if (!saved) throw new Error('Kargo kaydı oluşturuldu ancak okunamadı.')
    newShipment = mapDbShipmentToInterface(saved, order.orderNumber)
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
  const tracking = await provider.getTracking(shipment.providerShipmentId || shipment.trackingNumber)

  // Sync state if provider has new status
  if (tracking.status && tracking.status !== shipment.status) {
    const prevStatus = shipment.status

    if (isDatabaseConfigured) {
      const updateData: Record<string, unknown> = {
        status: toDbShipmentStatus(tracking.status),
        updatedAt: toDbTimestamp(new Date()),
      }
      if (tracking.trackingNumber && tracking.trackingNumber !== shipment.trackingNumber) updateData.trackingNumber = tracking.trackingNumber
      if (tracking.trackingUrl && tracking.trackingUrl !== shipment.trackingUrl) updateData.trackingUrl = tracking.trackingUrl
      if ((tracking.status === 'SHIPPED' || tracking.status === 'IN_TRANSIT') && !shipment.shippedAt) {
        updateData.shippedAt = toDbTimestamp(new Date(tracking.lastEventAt || Date.now()))
      }
      if (tracking.status === 'DELIVERED' && !shipment.deliveredAt) {
        updateData.deliveredAt = toDbTimestamp(new Date(tracking.deliveredAt || tracking.lastEventAt || Date.now()))
      }

      // Persist new events deduplicated
      const newEvents = (tracking.events || []).filter(
        (ev) => !shipment.events.some((e) => e.status === ev.status && e.description === ev.description)
      )

      await db.orm.public.Shipment.where({ id: shipment.id }).update(updateData as never)
      await addShipmentEvents(
        shipment.id,
        newEvents.map((ev) => ({ status: ev.status, description: ev.description, location: ev.location, eventAt: new Date(ev.eventAt) }))
      )
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
  const labelRes = await provider.getLabel(shipment.providerShipmentId || shipment.trackingNumber)

  if (isDatabaseConfigured) {
    await db.orm.public.Shipment.where({ id: shipment.id }).update({ labelData: labelRes.labelData, labelFormat: labelRes.labelFormat })
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
  await provider.cancelShipment(shipment.providerShipmentId || shipment.trackingNumber)

  const now = new Date()

  if (isDatabaseConfigured) {
    await db.orm.public.Shipment.where({ id: shipment.id }).update({
      status: 'RETURNED',
      cancelledAt: toDbTimestamp(now) as never,
      updatedAt: toDbTimestamp(now) as never,
    })
    await addShipmentEvents(shipment.id, [
      { status: 'CANCELLED', description: params.reason || 'Kargo gönderisi iptal edildi.', eventAt: now },
    ])
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

  return applyShipmentUpdate(found.shipment, {
    status: params.payload.status,
    description: params.payload.description,
    location: params.payload.location,
    eventAt: params.payload.timestamp,
    dedupeKey: params.payload.eventRef || `${params.payload.status}:${params.payload.timestamp || Date.now()}`,
    rawPayload: params.payload,
    source: params.providerName,
  })
}

/**
 * Applies one carrier status update (webhook) to a shipment and its order: event
 * history, shipment status, tracking number/link once known, order SHIPPED /
 * DELIVERED, customer mails, and for kapıda ödeme the payment collected at delivery.
 * Repeated updates (same dedupe key) are ignored.
 */
export async function applyShipmentUpdate(
  shipment: StoredShipment,
  update: {
    status: ShipmentStatus
    description?: string
    location?: string
    eventAt?: string
    dedupeKey: string
    rawPayload?: unknown
    trackingNumber?: string
    trackingUrl?: string
    source: string
  }
): Promise<{ success: boolean; message: string; shipmentId?: string }> {
  const eventAt = new Date(update.eventAt || Date.now())
  const description = update.description || `Kargo durumu: ${update.status}`

  if (isDatabaseConfigured) {
    const row = await db.orm.public.Shipment.select('webhookDedupeKeys').where({ id: shipment.id }).first()
    const keys: readonly string[] = row?.webhookDedupeKeys ?? []
    if (keys.includes(update.dedupeKey)) {
      return { success: true, message: 'Event already processed', shipmentId: shipment.id }
    }
    const fields: Record<string, unknown> = {
      updatedAt: toDbTimestamp(new Date()),
      webhookDedupeKeys: [...keys, update.dedupeKey].slice(-200),
    }
    // A label-stage update (Geliver PRE_TRANSIT) only adds to the history
    if (update.status !== 'LABEL_CREATED') fields.status = toDbShipmentStatus(update.status)
    if (update.status === 'CANCELLED') fields.cancelledAt = toDbTimestamp(eventAt)
    if ((update.status === 'SHIPPED' || update.status === 'IN_TRANSIT') && !shipment.shippedAt) fields.shippedAt = toDbTimestamp(eventAt)
    if (update.status === 'DELIVERED' && !shipment.deliveredAt) fields.deliveredAt = toDbTimestamp(eventAt)
    if (update.trackingNumber && update.trackingNumber !== shipment.trackingNumber) fields.trackingNumber = update.trackingNumber
    if (update.trackingUrl && update.trackingUrl !== shipment.trackingUrl) fields.trackingUrl = update.trackingUrl
    await db.orm.public.Shipment.where({ id: shipment.id }).update(fields as never)
    await addShipmentEvents(shipment.id, [{ status: update.status, description, location: update.location, eventAt, rawPayload: update.rawPayload }])
  } else {
    const isDuplicate = shipment.events.some((e) => e.status === update.status && e.description === description)
    if (isDuplicate) return { success: true, message: 'Event already processed', shipmentId: shipment.id }
    shipment.status = update.status
    shipment.updatedAt = new Date().toISOString()
    shipment.events.push({
      id: `ev-wh-${Date.now()}`,
      shipmentId: shipment.id,
      status: update.status,
      description,
      location: update.location,
      eventAt: eventAt.toISOString(),
      rawPayload: update.rawPayload as Record<string, unknown> | undefined,
      createdAt: new Date().toISOString(),
    })
  }

  // Order lifecycle
  const order = await getOrderByNumber(shipment.orderNumber, undefined, true)
  if (order) {
    if (update.status === 'SHIPPED' || update.status === 'IN_TRANSIT') {
      if (order.status === 'CONFIRMED' || order.status === 'PREPARING' || order.status === 'PACKING') {
        await updateOrderStatus(order.orderNumber, 'SHIPPED', `Kargo yola çıktı: ${update.trackingNumber || shipment.trackingNumber}`, 'carrier-webhook').catch(() => {})
      }
    } else if (update.status === 'OUT_FOR_DELIVERY') {
      createNotification({ orderNumber: order.orderNumber, eventType: 'OUT_FOR_DELIVERY', metadata: { carrier: shipment.provider, trackingNumber: shipment.trackingNumber } }).catch(() => {})
    } else if (update.status === 'DELIVERED') {
      if (order.paymentMethod === 'CASH_ON_DELIVERY') {
        // PTT collected the order total at the door
        await markCashOnDeliveryCollected(order.orderNumber, eventAt).catch((err) =>
          console.error(`[fulfillment] ${order.orderNumber} delivered but the cash-on-delivery payment could not be marked:`, err)
        )
      }
      if (order.status === 'SHIPPED' || order.status === 'PREPARING' || order.status === 'CONFIRMED') {
        // Orders still before SHIPPED (no transit update came) pass through it first
        if (order.status !== 'SHIPPED') await updateOrderStatus(order.orderNumber, 'SHIPPED', 'Kargo teslim edildi.', 'carrier-webhook').catch(() => {})
        await updateOrderStatus(order.orderNumber, 'DELIVERED', 'Kargo teslim edildi.', 'carrier-webhook').catch(() => {})
      }
    } else if (update.status === 'RETURNED' || update.status === 'DELIVERY_FAILED') {
      await logAuditEvent({
        action: 'SHIPMENT_NOT_DELIVERED',
        entity: 'Order',
        entityId: order.orderNumber,
        metadata: { status: update.status, description, cashOnDelivery: order.paymentMethod === 'CASH_ON_DELIVERY' },
      }).catch(() => {})
    }
  }

  await logAuditEvent({
    action: 'SHIPMENT_WEBHOOK_RECEIVED',
    entity: 'Shipment',
    entityId: shipment.id,
    metadata: { provider: update.source, trackingNumber: shipment.trackingNumber, status: update.status },
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
      const raws = await shipmentQuery().all()
      activeShipments = raws
        .filter((r) => !['DELIVERED', 'RETURNED', 'FAILED'].includes(r.status) && !r.cancelledAt)
        .map((r) => mapDbShipmentToInterface(r))
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
      const raws = await shipmentQuery().orderBy((x) => x.createdAt.desc()).limit(1000).all()
      const q = filters?.search?.toLocaleLowerCase('tr-TR')
      return raws
        .map((r) => mapDbShipmentToInterface(r))
        .filter((s) => !filters?.status || s.status === filters.status)
        .filter((s) => !filters?.provider || s.provider.toLowerCase().includes(filters.provider.toLowerCase()))
        .filter((s) => !q || s.trackingNumber.toLocaleLowerCase('tr-TR').includes(q) || s.orderNumber.toLocaleLowerCase('tr-TR').includes(q))
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
