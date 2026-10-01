import 'server-only'
import crypto from 'crypto'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { logAuditEvent } from '@/lib/services/admin.service'
import { WarehouseService } from './warehouse.service'
import { WarehouseScanService } from './warehouse-scan.service'
import {
  WarehouseValidationError,
  WarehouseNotFoundError,
  WarehouseInvalidStateError,
  WarehouseScanError,
} from './warehouse-error'
import type {
  WarehousePickListRecord,
  WarehousePickListItemRecord,
  ConsolidatedPickItem,
  ScanItemInput,
  ScanItemResult,
  WarehouseScanEventRecord,
} from './warehouse-types'

// In-memory pick lists & scan events
const inMemoryPickLists: Map<string, WarehousePickListRecord> = new Map()
const inMemoryPickListItems: Map<string, WarehousePickListItemRecord[]> = new Map()
const inMemoryScanEvents: Map<string, WarehouseScanEventRecord> = new Map()
const processedScanKeys: Map<string, ScanItemResult> = new Map()

export class PickingService {
  /**
   * Creates a pick list from one or more eligible fulfillments.
   * Consolidates items by SKU/productId while retaining order-level allocation.
   */
  public static async createPickList(
    fulfillmentIds: string[],
    assignedOperatorId?: string
  ): Promise<{
    pickList: WarehousePickListRecord
    consolidatedItems: ConsolidatedPickItem[]
  }> {
    if (!fulfillmentIds || fulfillmentIds.length === 0) {
      throw new WarehouseValidationError('Pick listesi oluşturmak için en az bir sipariş seçilmelidir.')
    }

    const fulfillments = await Promise.all(
      fulfillmentIds.map((id) => WarehouseService.getFulfillment(id))
    )

    // Verify all fulfillments are in eligible picking status
    for (const f of fulfillments) {
      if (f.status !== 'READY_TO_PICK' && f.status !== 'PICKING') {
        throw new WarehouseInvalidStateError(
          `Sipariş #${f.orderNumber || f.marketplaceOrderNumber || f.id} toplama için uygun durumda değil (mevcut durum: ${f.status}).`
        )
      }
    }

    const pickListId = `pkl_${Date.now()}_${Math.floor(Math.random() * 1000)}`
    const pickListNumber = `PICK-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(
      1000 + Math.random() * 9000
    )}`
    const now = new Date().toISOString()

    const pickListRecord: WarehousePickListRecord = {
      id: pickListId,
      pickListNumber,
      status: assignedOperatorId ? 'ASSIGNED' : 'PENDING',
      warehouseId: null,
      assignedOperatorId: assignedOperatorId || null,
      priority: 100,
      startedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    }

    const pickItems: WarehousePickListItemRecord[] = []
    const consolidationMap: Map<string, ConsolidatedPickItem> = new Map()

    for (const f of fulfillments) {
      const items = f.items || []
      for (const it of items) {
        const pklItemId = `pkl_it_${pickListId}_${it.id}`
        const pklItem: WarehousePickListItemRecord = {
          id: pklItemId,
          pickListId,
          fulfillmentId: f.id,
          fulfillmentItemId: it.id,
          productId: it.productId,
          sku: it.sku,
          barcode: it.barcode,
          productName: it.productNameSnapshot,
          requestedQuantity: it.orderedQuantity,
          pickedQuantity: it.pickedQuantity,
          status: it.status,
          createdAt: now,
          updatedAt: now,
        }
        pickItems.push(pklItem)

        // Consolidation
        const key = it.productId
        if (!consolidationMap.has(key)) {
          consolidationMap.set(key, {
            productId: it.productId,
            sku: it.sku,
            barcode: it.barcode,
            productName: it.productNameSnapshot,
            totalRequestedQuantity: 0,
            totalPickedQuantity: 0,
            allocations: [],
          })
        }
        const group = consolidationMap.get(key)!
        group.totalRequestedQuantity += it.orderedQuantity
        group.totalPickedQuantity += it.pickedQuantity
        group.allocations.push({
          fulfillmentId: f.id,
          fulfillmentItemId: it.id,
          requestedQuantity: it.orderedQuantity,
          pickedQuantity: it.pickedQuantity,
        })
      }

      // Transition fulfillment to PICKING if not already
      if (f.status === 'READY_TO_PICK') {
        await WarehouseService.updateFulfillmentStatus(f.id, 'PICKING', assignedOperatorId)
      }
    }

    pickListRecord.items = pickItems
    inMemoryPickLists.set(pickListId, pickListRecord)
    inMemoryPickListItems.set(pickListId, pickItems)

    await logAuditEvent({
      action: 'warehouse.picklist.created',
      entity: 'WarehousePickList',
      entityId: pickListId,
      metadata: {
        pickListNumber,
        fulfillmentCount: fulfillments.length,
        itemCount: pickItems.length,
      },
    })

    return {
      pickList: pickListRecord,
      consolidatedItems: Array.from(consolidationMap.values()),
    }
  }

  /**
   * Scans an item during picking.
   * Guarantees strict idempotency via idempotencyKey: WAREHOUSE_SCAN:{fulfillmentId}:{operatorId}:{clientRequestId}
   * Concurrency-safe: atomically updates pickedQuantity and prevents pickedQuantity > orderedQuantity.
   */
  public static async scanPickItem(input: ScanItemInput): Promise<ScanItemResult> {
    const qtyToScan = input.quantity ?? 1
    const idempotencyKey = `WAREHOUSE_SCAN:${input.fulfillmentId}:${input.operatorId}:${input.clientRequestId}`

    // 1. Idempotency Check: if identical request has already succeeded, return prior result without mutating
    if (processedScanKeys.has(idempotencyKey)) {
      const priorResult = processedScanKeys.get(idempotencyKey)!
      return {
        ...priorResult,
        idempotent: true,
        message: 'Tekrarlanan okutma isteği tespit edildi (Idempotent yanıt).',
      }
    }

    return WarehouseService.withFulfillmentLock(input.fulfillmentId, async () => {
      // Recheck inside lock
      if (processedScanKeys.has(idempotencyKey)) {
        return {
          ...processedScanKeys.get(idempotencyKey)!,
          idempotent: true,
          message: 'Tekrarlanan okutma isteği tespit edildi (Idempotent yanıt).',
        }
      }

      const fulfillment = await WarehouseService.getFulfillment(input.fulfillmentId)
      if (fulfillment.status !== 'PICKING' && fulfillment.status !== 'READY_TO_PICK') {
        throw new WarehouseScanError(
          `Sipariş toplama durumunda değil (Mevcut durum: ${fulfillment.status})`,
          'INACTIVE_FULFILLMENT'
        )
      }

      // 2. Resolve Barcode to Canonical Product
      const resolved = await WarehouseScanService.resolveProductIdentity(
        input.barcode,
        fulfillment.storeId
      )

      // 3. Find target item in fulfillment
      const items = fulfillment.items || []
      const targetItem = items.find(
        (it) =>
          it.productId === resolved.productId ||
          it.sku.toUpperCase() === resolved.sku.toUpperCase()
      )

      if (!targetItem) {
        // Log scan failure
        await this.recordScanEvent({
          fulfillmentId: fulfillment.id,
          fulfillmentItemId: null,
          operatorId: input.operatorId,
          barcode: input.barcode,
          scanType: 'PICK_SCAN',
          quantity: qtyToScan,
          success: false,
          errorCode: 'WRONG_ITEM',
          idempotencyKey,
        })
        throw new WarehouseScanError(
          `Okutulan ürün (${resolved.name} - SKU: ${resolved.sku}) bu siparişe ait değil.`,
          'WRONG_ITEM'
        )
      }

      // 4. Concurrency & Over-Pick Invariant Check
      if (targetItem.pickedQuantity + qtyToScan > targetItem.orderedQuantity) {
        await this.recordScanEvent({
          fulfillmentId: fulfillment.id,
          fulfillmentItemId: targetItem.id,
          operatorId: input.operatorId,
          barcode: input.barcode,
          scanType: 'PICK_SCAN',
          quantity: qtyToScan,
          success: false,
          errorCode: 'EXCESS_QUANTITY',
          idempotencyKey,
        })
        throw new WarehouseScanError(
          `Fazla ürün okutuldu: İstenen ${targetItem.orderedQuantity}, Mevcut toplanan ${targetItem.pickedQuantity}, Eklenmek istenen ${qtyToScan}.`,
          'EXCESS_QUANTITY'
        )
      }

      // 5. Apply mutation atomically
      targetItem.pickedQuantity += qtyToScan
      if (targetItem.pickedQuantity === targetItem.orderedQuantity) {
        targetItem.status = 'PICKED'
      }

      // Also ensure fulfillment is in PICKING state
      if (fulfillment.status === 'READY_TO_PICK') {
        fulfillment.status = 'PICKING'
        fulfillment.startedAt = new Date().toISOString()
      }

      // Check if all items in fulfillment are fully picked
      const isComplete = items.every((it) => it.pickedQuantity === it.orderedQuantity)
      if (isComplete) {
        fulfillment.status = 'PICKED'
        fulfillment.pickedAt = new Date().toISOString()
      }

      // 6. Record immutable successful scan event
      await this.recordScanEvent({
        fulfillmentId: fulfillment.id,
        fulfillmentItemId: targetItem.id,
        operatorId: input.operatorId,
        barcode: input.barcode,
        scanType: 'PICK_SCAN',
        quantity: qtyToScan,
        success: true,
        errorCode: null,
        idempotencyKey,
        metadata: {
          sku: targetItem.sku,
          orderedQuantity: targetItem.orderedQuantity,
          newPickedQuantity: targetItem.pickedQuantity,
        },
      })

      const result: ScanItemResult = {
        success: true,
        scannedQuantity: qtyToScan,
        pickedQuantity: targetItem.pickedQuantity,
        orderedQuantity: targetItem.orderedQuantity,
        remainingQuantity: targetItem.orderedQuantity - targetItem.pickedQuantity,
        productId: targetItem.productId,
        sku: targetItem.sku,
        barcode: targetItem.barcode,
        productName: targetItem.productNameSnapshot,
        isComplete,
      }

      processedScanKeys.set(idempotencyKey, result)
      return result
    })
  }

  /**
   * Complete picking for a fulfillment.
   * If any item is missing, completion is BLOCKED unless short-pick exception is processed.
   */
  public static async completePicking(
    fulfillmentId: string,
    operatorId: string
  ): Promise<WarehousePickListRecord | void> {
    return WarehouseService.withFulfillmentLock(fulfillmentId, async () => {
      const fulfillment = await WarehouseService.getFulfillment(fulfillmentId)
      const items = fulfillment.items || []

      const missing = items.filter((it) => it.pickedQuantity < it.orderedQuantity)
      if (missing.length > 0) {
        const details = missing
          .map((m) => `${m.sku} (${m.pickedQuantity}/${m.orderedQuantity})`)
          .join(', ')
        throw new WarehouseInvalidStateError(
          `Eksik ürünler varken toplama tamamlanamaz: ${details}. Eksik ürün süreci (SHORT_PICK) başlatılmalıdır.`
        )
      }

      await WarehouseService.updateFulfillmentStatus(fulfillmentId, 'PICKED', operatorId)

      await logAuditEvent({
        action: 'warehouse.pick.completed',
        entity: 'WarehouseFulfillment',
        entityId: fulfillmentId,
        metadata: { operatorId, itemCount: items.length },
      })
    })
  }

  /**
   * Record scan event immutably
   */
  private static async recordScanEvent(event: {
    fulfillmentId: string
    fulfillmentItemId: string | null
    operatorId: string
    barcode: string
    scanType: 'PICK_SCAN' | 'PACK_SCAN'
    quantity: number
    success: boolean
    errorCode: string | null
    idempotencyKey: string
    metadata?: Record<string, unknown>
  }): Promise<WarehouseScanEventRecord> {
    const scanEventId = `scan_${Date.now()}_${Math.floor(Math.random() * 1000)}`
    const record: WarehouseScanEventRecord = {
      id: scanEventId,
      ...event,
      createdAt: new Date().toISOString(),
    }
    inMemoryScanEvents.set(scanEventId, record)

    if (isDatabaseConfigured) {
      try {
        await (db.orm.public.WarehouseScanEvent as any).create({
          data: {
            id: record.id,
            fulfillmentId: record.fulfillmentId,
            fulfillmentItemId: record.fulfillmentItemId,
            operatorId: record.operatorId,
            barcode: record.barcode,
            scanType: record.scanType,
            quantity: record.quantity,
            success: record.success,
            errorCode: record.errorCode,
            idempotencyKey: record.idempotencyKey,
            metadata: record.metadata || null,
            createdAt: new Date(record.createdAt),
          },
        })
      } catch (err) {
        console.warn('[PickingService] DB scan event save fallback to memory:', err)
      }
    }
    return record
  }
}
