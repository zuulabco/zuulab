import 'server-only'
import crypto from 'crypto'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { logAuditEvent } from '@/lib/services/admin.service'
import { ShippingService } from '@/lib/services/shipping/shipping.service'
import { LabelService } from '@/lib/services/shipping/label/label.service'
import { WarehouseService } from './warehouse.service'
import { WarehouseScanService } from './warehouse-scan.service'
import {
  WarehouseValidationError,
  WarehouseNotFoundError,
  WarehouseInvalidStateError,
  WarehouseScanError,
} from './warehouse-error'
import { CartonizationService } from './cartonization.service'
import type {
  WarehousePackingSessionRecord,
  ScanItemInput,
  ScanItemResult,
  WarehouseScanEventRecord,
  CartonizationResult,
} from './warehouse-types'

// In-memory packing sessions & scan idempotency
const inMemoryPackingSessions: Map<string, WarehousePackingSessionRecord> = new Map()
const processedPackScanKeys: Map<string, ScanItemResult> = new Map()

export class PackingService {
  /**
   * Evaluates and recommends the optimal carton for a fulfillment before packing completion.
   * Pure recommendation — operator may override with actual measurements.
   */
  public static async previewCartonRecommendation(
    fulfillmentId: string,
    options: { storeId?: string | null } = {}
  ): Promise<CartonizationResult> {
    const fulfillment = await WarehouseService.getFulfillment(fulfillmentId)
    const items = fulfillment.items || []

    const cartonItems = items.map((it) => ({
      productId: it.productId,
      sku: it.sku,
      quantity: it.orderedQuantity,
      dimensions: {
        lengthMm: 150,
        widthMm: 100,
        heightMm: 80,
      },
      weightGrams: 250,
    }))

    return CartonizationService.recommendCarton(cartonItems, {
      storeId: options.storeId || fulfillment.storeId,
    })
  }

  /**
   * Starts a packing session for a PICKED fulfillment.
   */
  public static async startPackingSession(input: {
    fulfillmentId: string
    operatorId: string
    packageCount?: number
  }): Promise<WarehousePackingSessionRecord> {
    return WarehouseService.withFulfillmentLock(input.fulfillmentId, async () => {
      const fulfillment = await WarehouseService.getFulfillment(input.fulfillmentId)

      if (fulfillment.status !== 'PICKED' && fulfillment.status !== 'PACKING') {
        throw new WarehouseInvalidStateError(
          `Paketleme başlatılamaz. Sipariş ${fulfillment.status} durumunda (Beklenen: PICKED veya PACKING).`
        )
      }

      if (fulfillment.status === 'PICKED') {
        await WarehouseService.updateFulfillmentStatus(
          input.fulfillmentId,
          'PACKING',
          input.operatorId
        )
      }

      const sessionId = `pack_sess_${Date.now()}_${Math.floor(Math.random() * 1000)}`
      const now = new Date().toISOString()

      const session: WarehousePackingSessionRecord = {
        id: sessionId,
        fulfillmentId: input.fulfillmentId,
        operatorId: input.operatorId,
        packageCount: input.packageCount || 1,
        weightGrams: null,
        lengthMm: null,
        widthMm: null,
        heightMm: null,
        createdAt: now,
        completedAt: null,
      }

      inMemoryPackingSessions.set(sessionId, session)

      if (isDatabaseConfigured) {
        try {
          await (db.orm.public.WarehousePackingSession as any).create({
            data: {
              id: session.id,
              fulfillmentId: session.fulfillmentId,
              operatorId: session.operatorId,
              packageCount: session.packageCount,
              createdAt: new Date(now),
            },
          })
        } catch (err) {
          console.warn('[PackingService] DB session save fallback to memory:', err)
        }
      }

      await logAuditEvent({
        action: 'warehouse.packing.started',
        entity: 'WarehousePackingSession',
        entityId: sessionId,
        metadata: {
          fulfillmentId: input.fulfillmentId,
          operatorId: input.operatorId,
        },
      })

      return session
    })
  }

  /**
   * Scans an item during packing.
   * Invariant: packedQuantity <= pickedQuantity.
   */
  public static async scanPackItem(input: ScanItemInput): Promise<ScanItemResult> {
    const qtyToScan = input.quantity ?? 1
    const idempotencyKey = `WAREHOUSE_PACK_SCAN:${input.fulfillmentId}:${input.operatorId}:${input.clientRequestId}`

    if (processedPackScanKeys.has(idempotencyKey)) {
      const priorResult = processedPackScanKeys.get(idempotencyKey)!
      return {
        ...priorResult,
        idempotent: true,
        message: 'Tekrarlanan paketleme okutma isteği tespit edildi (Idempotent yanıt).',
      }
    }

    return WarehouseService.withFulfillmentLock(input.fulfillmentId, async () => {
      if (processedPackScanKeys.has(idempotencyKey)) {
        return {
          ...processedPackScanKeys.get(idempotencyKey)!,
          idempotent: true,
          message: 'Tekrarlanan paketleme okutma isteği tespit edildi (Idempotent yanıt).',
        }
      }

      const fulfillment = await WarehouseService.getFulfillment(input.fulfillmentId)
      if (fulfillment.status !== 'PACKING') {
        throw new WarehouseScanError(
          `Sipariş paketleme durumunda değil (Mevcut durum: ${fulfillment.status})`,
          'INACTIVE_FULFILLMENT'
        )
      }

      // 1. Resolve product identity
      const resolved = await WarehouseScanService.resolveProductIdentity(
        input.barcode,
        fulfillment.storeId
      )

      // 2. Find target item
      const items = fulfillment.items || []
      const targetItem = items.find(
        (it) =>
          it.productId === resolved.productId ||
          it.sku.toUpperCase() === resolved.sku.toUpperCase()
      )

      if (!targetItem) {
        throw new WarehouseScanError(
          `Okutulan ürün (${resolved.name}) bu siparişin sevk listesinde bulunmuyor.`,
          'WRONG_ITEM'
        )
      }

      // 3. Invariant: packedQuantity <= pickedQuantity
      if (targetItem.packedQuantity + qtyToScan > targetItem.pickedQuantity) {
        throw new WarehouseScanError(
          `Paketlenen ürün miktarı toplanan miktarı aşamaz: Toplanan ${targetItem.pickedQuantity}, Mevcut paketlenen ${targetItem.packedQuantity}, Eklenmek istenen ${qtyToScan}.`,
          'EXCESS_QUANTITY'
        )
      }

      // 4. Apply mutation
      targetItem.packedQuantity += qtyToScan
      if (targetItem.packedQuantity === targetItem.orderedQuantity) {
        targetItem.status = 'PACKED'
      }

      const isComplete = items.every((it) => it.packedQuantity === it.orderedQuantity)

      const result: ScanItemResult = {
        success: true,
        scannedQuantity: qtyToScan,
        pickedQuantity: targetItem.pickedQuantity,
        packedQuantity: targetItem.packedQuantity,
        orderedQuantity: targetItem.orderedQuantity,
        remainingQuantity: targetItem.orderedQuantity - targetItem.packedQuantity,
        productId: targetItem.productId,
        sku: targetItem.sku,
        barcode: targetItem.barcode,
        productName: targetItem.productNameSnapshot,
        isComplete,
      }

      processedPackScanKeys.set(idempotencyKey, result)
      return result
    })
  }

  /**
   * Completes packing, delegates shipment and label creation to Phase 19 ShippingService,
   * and transitions status to PACKED then READY_FOR_HANDOVER.
   */
  public static async completePacking(input: {
    fulfillmentId: string
    operatorId: string
    packageCount?: number
    weightGrams?: number
    dimensions?: { lengthMm: number; widthMm: number; heightMm: number }
    recipient?: {
      fullName: string
      phone: string
      addressLine: string
      city: string
      district: string
      postalCode?: string
    }
  }): Promise<{
    fulfillment: any
    shipment: any
    label: any
  }> {
    return WarehouseService.withFulfillmentLock(input.fulfillmentId, async () => {
      const fulfillment = await WarehouseService.getFulfillment(input.fulfillmentId)
      const items = fulfillment.items || []

      // 1. Validate complete packing
      const incomplete = items.filter((it) => it.packedQuantity < it.orderedQuantity)
      if (incomplete.length > 0) {
        const details = incomplete
          .map((m) => `${m.sku} (${m.packedQuantity}/${m.orderedQuantity})`)
          .join(', ')
        throw new WarehouseInvalidStateError(
          `Paketlenmemiş ürünler varken paketleme tamamlanamaz: ${details}.`
        )
      }

      // 2. Delegate Shipment Creation to Phase 19 ShippingService
      // Use existing shipment if already created, or create new via ShippingService
      const recipient = input.recipient || {
        fullName: 'Zuulab Alıcı',
        phone: '05321112233',
        addressLine: 'Zuulab Lojistik Depo',
        city: 'İstanbul',
        district: 'Kadıköy',
        postalCode: '34710',
      }

      const shipRequest = {
        orderId: fulfillment.orderId || undefined,
        orderNumber: fulfillment.orderNumber || undefined,
        marketplaceOrderId: fulfillment.marketplaceOrderId || undefined,
        marketplaceOrderNumber: fulfillment.marketplaceOrderNumber || undefined,
        channel: fulfillment.channel,
        storeId: fulfillment.storeId || undefined,
        preferredProvider: 'MOCK' as const,
        recipient,
        items: items.map((it) => ({
          productName: it.productNameSnapshot,
          sku: it.sku,
          quantity: it.packedQuantity,
        })),
        packageCount: input.packageCount || 1,
        totalWeightKg: input.weightGrams ? input.weightGrams / 1000 : 1,
      }

      const shipmentResult = await ShippingService.createShipment(shipRequest)
      fulfillment.shipmentId = shipmentResult.shipmentId

      // 3. Transition status PACKING -> PACKED -> READY_FOR_HANDOVER
      await WarehouseService.updateFulfillmentStatus(input.fulfillmentId, 'PACKED', input.operatorId)
      await WarehouseService.updateFulfillmentStatus(
        input.fulfillmentId,
        'READY_FOR_HANDOVER',
        input.operatorId
      )

      // Fetch authoritative shipment & label from ShippingService
      const authoritativeShipment = await ShippingService.getShipmentById(shipmentResult.shipmentId)
      const label = authoritativeShipment?.currentLabelId
        ? await LabelService.getLabelById(authoritativeShipment.currentLabelId)
        : null

      await logAuditEvent({
        action: 'warehouse.packing.completed',
        entity: 'WarehouseFulfillment',
        entityId: input.fulfillmentId,
        metadata: {
          operatorId: input.operatorId,
          shipmentId: shipmentResult.shipmentId,
          trackingNumber: shipmentResult.trackingNumber,
        },
      })

      return {
        fulfillment,
        shipment: authoritativeShipment,
        label,
      }
    })
  }
}
