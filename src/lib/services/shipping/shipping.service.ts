import 'server-only'
import crypto from 'crypto'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { logAuditEvent } from '@/lib/services/admin.service'
import {
  commitInventoryReservation,
  releaseInventoryReservation,
} from '@/lib/services/inventory.service'
import { getOrderByNumber } from '@/lib/services/orders.service'
import {
  CargoProviderFactory,
} from './shipping.factory'
import { ShippingRoutingService } from './routing/shipping-routing.service'
import { LabelService } from './label/label.service'
import {
  CargoInvalidStateError,
  CargoNotFoundError,
  CargoValidationError,
  CargoDuplicateError,
} from './shipping-error'
import type {
  CreateShipmentRequest,
  CreateShipmentResult,
  ShippingShipmentRecord,
  ShippingEventRecord,
  ShippingShipmentStatus,
  CarrierProviderType,
} from './shipping-types'

// In-memory fallback stores
const inMemoryShipments: Map<string, ShippingShipmentRecord> = new Map()
const inMemoryEvents: Map<string, ShippingEventRecord[]> = new Map()

// State Transition DAG rules
const VALID_TRANSITIONS: Record<ShippingShipmentStatus, ShippingShipmentStatus[]> = {
  PENDING: ['READY_TO_SHIP', 'CANCELLED', 'FAILED'],
  READY_TO_SHIP: ['SHIPMENT_CREATING', 'CANCELLED', 'FAILED'],
  SHIPMENT_CREATING: ['SHIPMENT_CREATED', 'FAILED', 'READY_TO_SHIP'],
  SHIPMENT_CREATED: ['LABEL_REQUESTED', 'LABEL_READY', 'SHIPPED', 'CANCELLED', 'FAILED'],
  LABEL_REQUESTED: ['LABEL_READY', 'FAILED'],
  LABEL_READY: ['SHIPPED', 'IN_TRANSIT', 'CANCELLED', 'LABEL_REQUESTED'],
  SHIPPED: ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURN_REQUESTED', 'FAILED'],
  IN_TRANSIT: ['OUT_FOR_DELIVERY', 'DELIVERED', 'RETURN_REQUESTED', 'FAILED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'RETURN_REQUESTED', 'FAILED'],
  DELIVERED: ['RETURN_REQUESTED'],
  RETURN_REQUESTED: ['RETURNED', 'IN_TRANSIT', 'FAILED'],
  RETURNED: [],
  CANCELLED: [],
  FAILED: ['READY_TO_SHIP', 'LABEL_REQUESTED', 'CANCELLED'],
}

export class ShippingService {
  /**
   * Universal Shipment Creation (Direct Storefront & Marketplace)
   */
  public static async createShipment(
    request: CreateShipmentRequest
  ): Promise<CreateShipmentResult> {
    // 1. Validate Marketplace Reconciliation Pre-requisite
    if (request.channel === 'MARKETPLACE') {
      const notes = (request.notes || '').toUpperCase()
      if (notes.includes('UNMATCHED') || notes.includes('PARTIALLY_MATCHED')) {
        throw new CargoValidationError(
          'Pazaryeri siparişinin ürün eşleşmesi (reconciliation) tamamlanmadan kargo kaydı oluşturulamaz.',
          request.preferredProvider
        )
      }
    }

    // 2. Check Idempotency: Has an active shipment already been created for this order?
    const existingShipment = await this.findActiveShipmentForOrder(
      request.orderId,
      request.marketplaceOrderId
    )

    if (existingShipment) {
      return {
        success: true,
        shipmentId: existingShipment.id,
        provider: existingShipment.provider,
        carrier: existingShipment.carrier,
        trackingNumber: existingShipment.trackingNumber || '',
        trackingUrl: existingShipment.trackingUrl || '',
        externalShipmentId: existingShipment.externalShipmentId || '',
        status: existingShipment.status,
        packageCount: existingShipment.packageCount,
        message: 'Mevcut kargo gönderisi bulundu (Idempotent işlem).',
      }
    }

    // 3. Carrier Selection / Routing
    const routing = ShippingRoutingService.selectCarrier(request)
    const providerInstance = CargoProviderFactory.getProvider(routing.selectedProvider)

    // 4. Dispatch carrier registration
    const carrierResult = await providerInstance.createShipment(request)

    // 5. Build and save ShippingShipment entity
    const shipmentId = `ship_${Date.now()}_${Math.floor(Math.random() * 1000)}`
    const now = new Date().toISOString()

    const shipmentRecord: ShippingShipmentRecord = {
      id: shipmentId,
      orderId: request.orderId || null,
      orderNumber: request.orderNumber || null,
      marketplaceOrderId: request.marketplaceOrderId || null,
      marketplaceOrderNumber: request.marketplaceOrderNumber || null,
      channel: request.channel,
      storeId: request.storeId || null,
      provider: routing.selectedProvider,
      carrier: routing.carrierName,
      externalShipmentId: carrierResult.externalShipmentId,
      trackingNumber: carrierResult.trackingNumber,
      trackingUrl: carrierResult.trackingUrl,
      status: 'LABEL_READY', // Carrier returned tracking; label is immediately generated
      serviceType: request.serviceType || 'STANDARD',
      recipientName: request.recipient.fullName,
      recipientPhone: request.recipient.phone,
      shippingAddress: request.recipient,
      packageCount: request.packageCount || 1,
      totalWeightKg: request.totalWeightKg || null,
      notes: request.notes || null,
      currentLabelId: null,
      shippedAt: null,
      deliveredAt: null,
      cancelledAt: null,
      createdAt: now,
      updatedAt: now,
    }

    // 6. Generate initial label (v1)
    const initialLabel = await LabelService.generateLabel(shipmentRecord, 'PDF', false)
    shipmentRecord.currentLabelId = initialLabel.labelId

    // 7. Persist to DB or Memory
    await this.saveShipment(shipmentRecord)

    // 8. Append immutable creation events
    await this.recordEvent({
      shipmentId,
      provider: routing.selectedProvider,
      eventType: 'SHIPMENT_CREATED',
      previousStatus: 'PENDING',
      newStatus: 'LABEL_READY',
      description: `Kargo kaydı oluşturuldu. Takip No: ${carrierResult.trackingNumber} (${routing.reason})`,
      payload: { externalShipmentId: carrierResult.externalShipmentId },
    })

    await logAuditEvent({
      action: 'shipping.shipment.created',
      entity: 'ShippingShipment',
      entityId: shipmentId,
      metadata: {
        orderId: request.orderId,
        marketplaceOrderId: request.marketplaceOrderId,
        provider: routing.selectedProvider,
        trackingNumber: carrierResult.trackingNumber,
        carrier: routing.carrierName,
        routingReason: routing.reason,
      },
    })

    return {
      success: true,
      shipmentId,
      provider: routing.selectedProvider,
      carrier: routing.carrierName,
      trackingNumber: carrierResult.trackingNumber,
      trackingUrl: carrierResult.trackingUrl,
      externalShipmentId: carrierResult.externalShipmentId,
      status: 'LABEL_READY',
      packageCount: shipmentRecord.packageCount,
      message: 'Kargo gönderisi ve 100x100mm etiket başarıyla oluşturuldu.',
    }
  }

  /**
   * Advances shipment through the state machine with validation and inventory lifecycle triggers
   */
  public static async updateShipmentStatus(
    shipmentId: string,
    newStatus: ShippingShipmentStatus,
    eventDetails: {
      description?: string
      location?: string
      payload?: Record<string, unknown>
      externalEventId?: string
    } = {}
  ): Promise<ShippingShipmentRecord> {
    const shipment = await this.getShipmentById(shipmentId)
    const currentStatus = shipment.status

    // Idempotent: If status is identical, safe no-op
    if (currentStatus === newStatus) {
      return shipment
    }

    // Validate Transition DAG
    const allowed = VALID_TRANSITIONS[currentStatus] || []
    if (!allowed.includes(newStatus)) {
      throw new CargoInvalidStateError(
        `Geçersiz kargo durum geçişi: '${currentStatus}' durumundan '${newStatus}' durumuna geçilemez.`
      )
    }

    const now = new Date().toISOString()
    shipment.status = newStatus
    shipment.updatedAt = now

    // State specific side-effects
    if (newStatus === 'SHIPPED') {
      shipment.shippedAt = now

      // Phase 18 Inventory Commit: Physical stock decrement occurs when package is physically dispatched
      if (shipment.orderId || shipment.marketplaceOrderId || shipment.orderNumber) {
        try {
          let itemsToCommit: Array<{ productId: string; quantity: number }> = []
          if (shipment.orderNumber) {
            const ord = await getOrderByNumber(shipment.orderNumber)
            if (ord && ord.items) {
              itemsToCommit = ord.items.map((it: any) => ({
                productId: it.productId,
                quantity: it.quantity,
              }))
            }
          }
          await commitInventoryReservation(
            itemsToCommit,
            shipment.orderNumber || shipment.marketplaceOrderNumber || undefined,
            {
              context: shipment.channel === 'MARKETPLACE' ? 'MARKETPLACE' : 'DIRECT',
              storeId: shipment.storeId || undefined,
              externalOrderId: shipment.marketplaceOrderId || undefined,
              reason: `Kargo Gönderildi (${shipment.trackingNumber}) Fiziksel Stok Düşümü`,
            }
          )
        } catch (invErr) {
          console.warn('[ShippingService] Inventory commit warning on SHIPPED:', invErr)
        }
      }
    } else if (newStatus === 'DELIVERED') {
      shipment.deliveredAt = now
    } else if (newStatus === 'CANCELLED') {
      shipment.cancelledAt = now

      // Release reserved inventory if cancelled before SHIPPED
      if (currentStatus !== 'SHIPPED' && currentStatus !== 'DELIVERED') {
        try {
          let itemsToRelease: Array<{ productId: string; quantity: number }> = []
          if (shipment.orderNumber) {
            const ord = await getOrderByNumber(shipment.orderNumber)
            if (ord && ord.items) {
              itemsToRelease = ord.items.map((it: any) => ({
                productId: it.productId,
                quantity: it.quantity,
              }))
            }
          }
          await releaseInventoryReservation(
            itemsToRelease,
            shipment.orderNumber || shipment.marketplaceOrderNumber || undefined,
            {
              context: shipment.channel === 'MARKETPLACE' ? 'MARKETPLACE' : 'DIRECT',
              storeId: shipment.storeId || undefined,
              externalOrderId: shipment.marketplaceOrderId || undefined,
              reason: 'Kargo Gönderisi İptal Edildi - Rezervasyon Serbest Bırakma',
            }
          )
        } catch (relErr) {
          console.warn('[ShippingService] Inventory release warning on CANCELLED:', relErr)
        }
      }
    }

    await this.saveShipment(shipment)

    // Record Event
    await this.recordEvent({
      shipmentId,
      provider: shipment.provider,
      eventType: `STATUS_${newStatus}`,
      previousStatus: currentStatus,
      newStatus,
      description: eventDetails.description || `Kargo durumu güncellendi: ${newStatus}`,
      location: eventDetails.location,
      externalEventId: eventDetails.externalEventId,
      payload: eventDetails.payload,
    })

    await logAuditEvent({
      action: 'shipping.tracking.updated',
      entity: 'ShippingShipment',
      entityId: shipmentId,
      metadata: {
        previousStatus: currentStatus,
        newStatus,
        trackingNumber: shipment.trackingNumber,
      },
    })

    return shipment
  }

  /**
   * Cancels an active shipment
   */
  public static async cancelShipment(shipmentId: string, reason?: string): Promise<ShippingShipmentRecord> {
    const shipment = await this.getShipmentById(shipmentId)
    if (shipment.status === 'DELIVERED' || shipment.status === 'RETURNED' || shipment.status === 'CANCELLED') {
      throw new CargoInvalidStateError(
        `'${shipment.status}' durumundaki kargo gönderisi iptal edilemez.`
      )
    }

    const providerInstance = CargoProviderFactory.getProvider(shipment.provider)
    await providerInstance.cancelShipment(shipment.externalShipmentId || shipment.id)

    const updated = await this.updateShipmentStatus(shipmentId, 'CANCELLED', {
      description: reason || 'Yönetici tarafından kargo gönderisi iptal edildi.',
    })

    await logAuditEvent({
      action: 'shipping.shipment.cancelled',
      entity: 'ShippingShipment',
      entityId: shipmentId,
      metadata: { reason },
    })

    return updated
  }

  /**
   * Syncs live tracking from carrier API
   */
  public static async syncTracking(shipmentId: string): Promise<ShippingShipmentRecord> {
    const shipment = await this.getShipmentById(shipmentId)
    if (!shipment.trackingNumber) return shipment

    const providerInstance = CargoProviderFactory.getProvider(shipment.provider)
    const tracking = await providerInstance.getTracking(shipment.trackingNumber)

    if (tracking.status && tracking.status !== shipment.status) {
      return await this.updateShipmentStatus(shipmentId, tracking.status, {
        description: 'Taşıyıcı API üzerinden otomatik takip güncellemesi.',
        payload: { events: tracking.events },
      })
    }

    return shipment
  }

  public static async getShipmentById(id: string): Promise<ShippingShipmentRecord> {
    if (inMemoryShipments.has(id)) {
      return inMemoryShipments.get(id)!
    }

    if (isDatabaseConfigured) {
      try {
        const s = await (db.orm.public as any).ShippingShipment.findUnique({
          where: { id },
        })
        if (s) {
          const rec: ShippingShipmentRecord = {
            id: s.id,
            orderId: s.orderId,
            orderNumber: s.orderNumber,
            marketplaceOrderId: s.marketplaceOrderId,
            marketplaceOrderNumber: s.marketplaceOrderNumber,
            channel: s.channel as any,
            storeId: s.storeId,
            provider: s.provider as CarrierProviderType,
            carrier: s.carrier,
            externalShipmentId: s.externalShipmentId,
            trackingNumber: s.trackingNumber,
            trackingUrl: s.trackingUrl,
            status: s.status,
            serviceType: s.serviceType,
            recipientName: s.recipientName,
            recipientPhone: s.recipientPhone,
            shippingAddress: s.shippingAddress,
            packageCount: s.packageCount,
            totalWeightKg: s.totalWeightKg ? Number(s.totalWeightKg) : null,
            notes: s.notes,
            currentLabelId: s.currentLabelId,
            shippedAt: s.shippedAt?.toISOString?.() ?? null,
            deliveredAt: s.deliveredAt?.toISOString?.() ?? null,
            cancelledAt: s.cancelledAt?.toISOString?.() ?? null,
            createdAt: s.createdAt?.toISOString?.() ?? new Date().toISOString(),
            updatedAt: s.updatedAt?.toISOString?.() ?? new Date().toISOString(),
          }
          inMemoryShipments.set(s.id, rec)
          return rec
        }
      } catch {}
    }

    throw new CargoNotFoundError(`Kargo gönderisi '${id}' bulunamadı.`)
  }

  public static async findShipmentByTrackingNumber(trackingNumber: string): Promise<ShippingShipmentRecord | null> {
    for (const s of inMemoryShipments.values()) {
      if (s.trackingNumber === trackingNumber) return s
    }

    if (isDatabaseConfigured) {
      try {
        const s = await (db.orm.public as any).ShippingShipment.findFirst({
          where: { trackingNumber },
        })
        if (s) return this.getShipmentById(s.id)
      } catch {}
    }

    return null
  }

  public static async findActiveShipmentForOrder(
    orderId?: string | null,
    marketplaceOrderId?: string | null
  ): Promise<ShippingShipmentRecord | null> {
    for (const s of inMemoryShipments.values()) {
      if (s.status === 'CANCELLED') continue
      if (orderId && s.orderId === orderId) return s
      if (marketplaceOrderId && s.marketplaceOrderId === marketplaceOrderId) return s
    }

    if (isDatabaseConfigured) {
      try {
        const whereClause: any = {
          status: { notIn: ['CANCELLED'] },
        }
        if (orderId) whereClause.orderId = orderId
        if (marketplaceOrderId) whereClause.marketplaceOrderId = marketplaceOrderId

        const s = await (db.orm.public as any).ShippingShipment.findFirst({
          where: whereClause,
        })
        if (s) return this.getShipmentById(s.id)
      } catch {}
    }

    return null
  }

  public static async listShipments(filters: {
    status?: ShippingShipmentStatus
    provider?: CarrierProviderType
    channel?: 'DIRECT' | 'MARKETPLACE'
    storeId?: string
    search?: string
  } = {}): Promise<ShippingShipmentRecord[]> {
    let list = Array.from(inMemoryShipments.values())

    if (filters.status) {
      list = list.filter((s) => s.status === filters.status)
    }
    if (filters.provider) {
      list = list.filter((s) => s.provider === filters.provider)
    }
    if (filters.channel) {
      list = list.filter((s) => s.channel === filters.channel)
    }
    if (filters.storeId) {
      list = list.filter((s) => s.storeId === filters.storeId)
    }
    if (filters.search) {
      const q = filters.search.toLowerCase()
      list = list.filter(
        (s) =>
          (s.trackingNumber && s.trackingNumber.toLowerCase().includes(q)) ||
          (s.orderNumber && s.orderNumber.toLowerCase().includes(q)) ||
          (s.marketplaceOrderNumber && s.marketplaceOrderNumber.toLowerCase().includes(q)) ||
          s.recipientName.toLowerCase().includes(q)
      )
    }

    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  public static async getShipmentEvents(shipmentId: string): Promise<ShippingEventRecord[]> {
    return inMemoryEvents.get(shipmentId) || []
  }

  private static async saveShipment(shipment: ShippingShipmentRecord): Promise<void> {
    inMemoryShipments.set(shipment.id, shipment)

    if (isDatabaseConfigured) {
      try {
        await (db.orm.public as any).ShippingShipment.upsert({
          where: { id: shipment.id },
          create: {
            id: shipment.id,
            orderId: shipment.orderId,
            orderNumber: shipment.orderNumber,
            marketplaceOrderId: shipment.marketplaceOrderId,
            marketplaceOrderNumber: shipment.marketplaceOrderNumber,
            channel: shipment.channel,
            storeId: shipment.storeId,
            provider: shipment.provider,
            carrier: shipment.carrier,
            externalShipmentId: shipment.externalShipmentId,
            trackingNumber: shipment.trackingNumber,
            trackingUrl: shipment.trackingUrl,
            status: shipment.status,
            serviceType: shipment.serviceType,
            recipientName: shipment.recipientName,
            recipientPhone: shipment.recipientPhone,
            shippingAddress: shipment.shippingAddress as any,
            packageCount: shipment.packageCount,
            totalWeightKg: shipment.totalWeightKg,
            notes: shipment.notes,
            currentLabelId: shipment.currentLabelId,
            shippedAt: shipment.shippedAt ? new Date(shipment.shippedAt) : null,
            deliveredAt: shipment.deliveredAt ? new Date(shipment.deliveredAt) : null,
            cancelledAt: shipment.cancelledAt ? new Date(shipment.cancelledAt) : null,
          },
          update: {
            status: shipment.status,
            trackingNumber: shipment.trackingNumber,
            trackingUrl: shipment.trackingUrl,
            currentLabelId: shipment.currentLabelId,
            shippedAt: shipment.shippedAt ? new Date(shipment.shippedAt) : null,
            deliveredAt: shipment.deliveredAt ? new Date(shipment.deliveredAt) : null,
            cancelledAt: shipment.cancelledAt ? new Date(shipment.cancelledAt) : null,
          },
        })
      } catch (err) {
        console.warn('[ShippingService] DB save fallback to memory:', err)
      }
    }
  }

  private static async recordEvent(event: {
    shipmentId: string
    provider: string
    eventType: string
    previousStatus: string | null
    newStatus: string
    description: string
    location?: string | null
    externalEventId?: string | null
    payload?: Record<string, unknown> | null
  }): Promise<void> {
    const id = `ev_${Date.now()}_${Math.floor(Math.random() * 1000)}`
    const now = new Date().toISOString()
    const idempotencyKey = `EV:${event.shipmentId}:${event.eventType}:${event.newStatus}:${Date.now()}`

    const evRecord: ShippingEventRecord = {
      id,
      shipmentId: event.shipmentId,
      provider: event.provider,
      eventType: event.eventType,
      previousStatus: event.previousStatus,
      newStatus: event.newStatus,
      description: event.description,
      location: event.location || null,
      externalEventId: event.externalEventId || null,
      payload: event.payload || null,
      occurredAt: now,
      receivedAt: now,
      idempotencyKey,
      createdAt: now,
    }

    const currentList = inMemoryEvents.get(event.shipmentId) || []
    currentList.push(evRecord)
    inMemoryEvents.set(event.shipmentId, currentList)

    if (isDatabaseConfigured) {
      try {
        await (db.orm.public as any).ShippingEvent.create({
          id,
          shipmentId: event.shipmentId,
          provider: event.provider,
          eventType: event.eventType,
          previousStatus: event.previousStatus,
          newStatus: event.newStatus,
          description: event.description,
          location: event.location || null,
          externalEventId: event.externalEventId || null,
          payload: event.payload ? (event.payload as any) : undefined,
          idempotencyKey,
        })
      } catch {}
    }
  }
}
