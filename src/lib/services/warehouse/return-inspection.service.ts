import 'server-only'
import crypto from 'crypto'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { logAuditEvent } from '@/lib/services/admin.service'
import { restockProductInventory } from '@/lib/services/inventory.service'
import { WarehouseScanService } from './warehouse-scan.service'
import { LocationService } from './location.service'
import { WarehouseExceptionService } from './exception.service'
import {
  WarehouseValidationError,
  WarehouseNotFoundError,
  WarehouseInvalidStateError,
  WarehouseScanError,
} from './warehouse-error'
import type {
  WarehouseReturnInspectionRecord,
  WarehouseReturnInspectionItemRecord,
  ReturnInspectionCondition,
  ReturnInspectionDisposition,
  InspectItemInput,
} from './warehouse-types'

// In-memory returns registry
const inMemoryInspections: Map<string, WarehouseReturnInspectionRecord> = new Map()
const inMemoryInspectionItems: Map<string, WarehouseReturnInspectionItemRecord[]> = new Map()
const inMemoryInspectionIdempotencyKeys: Set<string> = new Set()

// Fallback return requests store for testing/memory integration
interface MockRmaData {
  returnNumber: string
  orderNumber: string
  trackingNumber?: string
  status: string
  items: Array<{
    id: string
    productId: string
    sku: string
    productName: string
    quantity: number
    barcode?: string
  }>
}

const registeredRmas: Map<string, MockRmaData> = new Map()

export class ReturnInspectionService {
  /**
   * Helper to register RMA data into in-memory store for testing or offline dev
   */
  public static registerReturnPackage(rma: MockRmaData): void {
    registeredRmas.set(rma.returnNumber, rma)
    if (rma.trackingNumber) {
      registeredRmas.set(rma.trackingNumber, rma)
    }
    registeredRmas.set(rma.orderNumber, rma)
  }

  /**
   * Scans a barcode on the return package and resolves the ReturnRequest.
   * Supported:
   * - RMA Number (e.g. RMA-001)
   * - Order Number (e.g. ZUU-001)
   * - Return Tracking Number (e.g. SURAT-999)
   *
   * Rejects fuzzy matches. Exact match required.
   */
  public static async scanReturnPackage(
    scannedBarcode: string
  ): Promise<MockRmaData> {
    const norm = WarehouseScanService.normalizeBarcode(scannedBarcode)
    if (!norm) {
      throw new WarehouseScanError('Geçersiz veya boş barkod okutuldu.', 'PRODUCT_NOT_FOUND')
    }

    // Exact match in registered RMAs
    const matched = registeredRmas.get(norm)
    if (matched) {
      return matched
    }

    // Try finding in DB if configured
    if (isDatabaseConfigured) {
      try {
        const raw = await (db.orm.public.ReturnRequest as any)
          .where({
            OR: [
              { returnNumber: norm },
              { order: { orderNumber: norm } },
              { shipment: { trackingNumber: norm } },
            ],
          })
          .include({ items: true, order: true, shipment: true })
          .first()

        if (raw) {
          const rmaObj: MockRmaData = {
            returnNumber: raw.returnNumber,
            orderNumber: raw.order?.orderNumber || raw.orderId,
            trackingNumber: raw.shipment?.trackingNumber,
            status: raw.status,
            items: (raw.items || []).map((it: any) => ({
              id: it.id,
              productId: it.productId,
              sku: it.sku,
              productName: it.productName,
              quantity: it.quantity,
            })),
          }
          this.registerReturnPackage(rmaObj)
          return rmaObj
        }
      } catch (err) {
        console.warn('[ReturnInspectionService] DB lookup error:', err)
      }
    }

    throw new WarehouseNotFoundError(
      `İade paketi bulunamadı (#${norm}). Barkod eşleşmedi (fuzzy eşleme yasaktır).`
    )
  }

  /**
   * Initiates a physical return inspection session.
   */
  public static async startInspection(input: {
    returnNumber: string
    inspectedBy: string
  }): Promise<WarehouseReturnInspectionRecord> {
    const rma = await this.scanReturnPackage(input.returnNumber)

    // Check if an inspection already exists
    for (const insp of inMemoryInspections.values()) {
      if (insp.returnNumber === rma.returnNumber && insp.status !== 'CANCELLED') {
        return insp
      }
    }

    const now = new Date().toISOString()
    const inspectionId = `insp_${Date.now()}_${Math.floor(Math.random() * 1000)}`

    const record: WarehouseReturnInspectionRecord = {
      id: inspectionId,
      returnRequestId: `req_${rma.returnNumber}`,
      returnNumber: rma.returnNumber,
      inspectedBy: input.inspectedBy,
      status: 'INSPECTING',
      totalExpectedItems: rma.items.reduce((sum, it) => sum + it.quantity, 0),
      totalInspectedItems: 0,
      notes: null,
      startedAt: now,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      items: [],
    }

    inMemoryInspections.set(inspectionId, record)
    inMemoryInspectionItems.set(inspectionId, [])

    await logAuditEvent({
      action: 'warehouse.return.inspected',
      entity: 'WarehouseReturnInspection',
      entityId: inspectionId,
      userId: input.inspectedBy,
      metadata: { returnNumber: rma.returnNumber },
    }).catch(() => {})

    return record
  }

  /**
   * Scans and inspects an item inside the returned package.
   *
   * Invariants:
   * 1. Exact barcode resolution hierarchy (Exact SKU -> Exact Barcode -> Marketplace mapping).
   *    Fuzzy match is strictly forbidden!
   * 2. Scanned item MUST belong to the expected items on the RMA.
   *    Wrong item is strictly rejected or marked as exception.
   * 3. RESTOCK:
   *    - Follows authoritative Phase 18 InventoryService via restockProductInventory(...)
   *    - Never mutates central stock directly from warehouse code!
   *    - Places inventory into designated location (e.g. MAIN-A-RESTOCK-01).
   *    - Idempotency guaranteed: duplicate scan does not restock twice!
   * 4. DAMAGED / QUARANTINE:
   *    - Does NOT restock as sellable inventory!
   *    - Places item into quarantine location (MAIN-QUARANTINE-01).
   *    - Creates a WarehouseException.
   */
  public static async inspectItem(input: InspectItemInput): Promise<{
    success: boolean
    inspectionItem: WarehouseReturnInspectionItemRecord
    idempotent: boolean
    message?: string
  }> {
    const inspection = inMemoryInspections.get(input.inspectionId)
    if (!inspection) {
      throw new WarehouseNotFoundError(`İnceleme oturumu bulunamadı: ${input.inspectionId}`)
    }
    if (inspection.status !== 'INSPECTING') {
      throw new WarehouseInvalidStateError(`İnceleme oturumu aktif değil (durum: ${inspection.status}).`)
    }

    // 1. Resolve scanned barcode strictly
    const resolved = await WarehouseScanService.resolveProductIdentity(input.scannedBarcode)

    // 2. Validate product belongs to this return
    const rma = registeredRmas.get(inspection.returnNumber)
    const expectedItem = rma?.items.find((it) => it.productId === resolved.productId)

    if (!expectedItem) {
      // Wrong item scanned!
      await WarehouseExceptionService.createException({
        fulfillmentId: `return_${inspection.returnNumber}`,
        type: 'WRONG_ITEM',
        severity: 'HIGH',
        description: `İade paketinde beklenmeyen ürün okutuldu: ${resolved.sku} (${resolved.name}).`,
        createdBy: input.adminUserId || inspection.inspectedBy,
      })
      throw new WarehouseValidationError(
        `Yanlış ürün okutuldu! Ürün (#${resolved.sku}) bu iade paketinde (${inspection.returnNumber}) beklenmiyordu.`
      )
    }

    const version = input.idempotencyVersion || 'v1'
    const idempotencyKey = `RETURN_INSPECTION:${inspection.returnNumber}:${resolved.productId}:${version}`

    // 3. Check idempotency
    const existingItems = inMemoryInspectionItems.get(input.inspectionId) || []
    const existingItem = existingItems.find(
      (it) => it.productId === resolved.productId && it.condition === input.condition
    )

    if (inMemoryInspectionIdempotencyKeys.has(idempotencyKey) && existingItem) {
      return {
        success: true,
        inspectionItem: existingItem,
        idempotent: true,
        message: 'İşlem zaten daha önce gerçekleştirildi (idempotent).',
      }
    }

    const qty = input.quantity || 1
    const now = new Date().toISOString()
    const inspectionItemId = `insp_it_${Date.now()}_${Math.floor(Math.random() * 1000)}`

    let restocked = false
    let exceptionId: string | null = null
    let targetLocationId = input.targetLocationId

    // 4. Branch based on disposition
    if (input.disposition === 'RESTOCK') {
      // Must be restockable condition
      if (input.condition === 'DAMAGED' || input.condition === 'DEFECTIVE') {
        throw new WarehouseValidationError(
          'Hasarlı veya kusurlu ürün doğrudan tekrar satış stoğuna (RESTOCK) eklenemez!'
        )
      }

      // Default restock location
      if (!targetLocationId) {
        const defaultRestockLoc = await LocationService.getLocationByCode('MAIN-A-RESTOCK-01')
        targetLocationId = defaultRestockLoc ? defaultRestockLoc.id : 'loc_bin_restock_01'
      }

      // Invariant: Move into warehouse location projection
      await LocationService.recordMovement({
        warehouseId: 'MAIN',
        movementType: 'RETURN_RESTOCK',
        sourceLocationId: null,
        destinationLocationId: targetLocationId,
        productId: resolved.productId,
        sku: resolved.sku,
        quantity: qty,
        operatorId: input.adminUserId || inspection.inspectedBy,
        referenceId: inspection.returnNumber,
        idempotencyKey: `LOC_MOV:${idempotencyKey}`,
        notes: `İade kabul restock (${inspection.returnNumber})`,
      })

      // Invariant: Call authoritative Phase 18 InventoryService
      const restockResult = await restockProductInventory(
        resolved.productId,
        qty,
        inspection.returnNumber,
        input.adminUserId || inspection.inspectedBy,
        { idempotencyKey }
      )
      restocked = restockResult.success

      await logAuditEvent({
        action: 'warehouse.return.restocked',
        entity: 'WarehouseReturnInspection',
        entityId: inspection.id,
        userId: input.adminUserId || inspection.inspectedBy,
        metadata: {
          returnNumber: inspection.returnNumber,
          sku: resolved.sku,
          quantity: qty,
          newStock: restockResult.newStock,
        },
      }).catch(() => {})
    } else {
      // DAMAGED / QUARANTINE / SCRAP / REPAIR
      // Invariant: Damaged goods NEVER mutate central inventory into sellable stock!
      if (!targetLocationId) {
        const defaultQuarantineLoc = await LocationService.getLocationByCode('MAIN-QUARANTINE-01')
        targetLocationId = defaultQuarantineLoc ? defaultQuarantineLoc.id : 'loc_bin_quarantine_01'
      }

      // Place in quarantine location
      await LocationService.recordMovement({
        warehouseId: 'MAIN',
        movementType: 'QUARANTINE',
        sourceLocationId: null,
        destinationLocationId: targetLocationId,
        productId: resolved.productId,
        sku: resolved.sku,
        quantity: qty,
        operatorId: input.adminUserId || inspection.inspectedBy,
        referenceId: inspection.returnNumber,
        idempotencyKey: `LOC_MOV_QUARANTINE:${idempotencyKey}`,
        notes: `Hasarlı iade karantinaya alındı (${inspection.returnNumber})`,
      })

      // Create warehouse exception
      const exc = await WarehouseExceptionService.createException({
        fulfillmentId: `return_${inspection.returnNumber}`,
        type: 'DAMAGED_ITEM',
        severity: 'HIGH',
        description: `İade ürün (#${resolved.sku}) hasarlı/kusurlu olarak tespit edildi (${input.condition}). Karantinaya sevk edildi.`,
        createdBy: input.adminUserId || inspection.inspectedBy,
      })
      exceptionId = exc.id

      await logAuditEvent({
        action: 'warehouse.return.quarantined',
        entity: 'WarehouseReturnInspection',
        entityId: inspection.id,
        userId: input.adminUserId || inspection.inspectedBy,
        metadata: {
          returnNumber: inspection.returnNumber,
          sku: resolved.sku,
          condition: input.condition,
          disposition: input.disposition,
          exceptionId,
        },
      }).catch(() => {})
    }

    const itemRecord: WarehouseReturnInspectionItemRecord = {
      id: inspectionItemId,
      inspectionId: input.inspectionId,
      returnItemId: expectedItem.id,
      productId: resolved.productId,
      sku: resolved.sku,
      scannedBarcode: input.scannedBarcode,
      condition: input.condition,
      disposition: input.disposition,
      quantity: qty,
      targetLocationId: targetLocationId || null,
      restocked,
      exceptionId,
      notes: input.notes || null,
      createdAt: now,
      updatedAt: now,
    }

    existingItems.push(itemRecord)
    inMemoryInspectionItems.set(input.inspectionId, existingItems)
    inMemoryInspectionIdempotencyKeys.add(idempotencyKey)

    // Update inspection totals
    inspection.totalInspectedItems += qty
    inspection.updatedAt = now

    return {
      success: true,
      inspectionItem: itemRecord,
      idempotent: false,
    }
  }

  /**
   * Completes an inspection session and marks return request as INSPECTED.
   */
  public static async completeInspection(
    inspectionId: string,
    adminUserId: string,
    notes?: string
  ): Promise<WarehouseReturnInspectionRecord> {
    const inspection = inMemoryInspections.get(inspectionId)
    if (!inspection) {
      throw new WarehouseNotFoundError(`İnceleme oturumu bulunamadı: ${inspectionId}`)
    }

    const now = new Date().toISOString()
    inspection.status = 'COMPLETED'
    inspection.completedAt = now
    if (notes) inspection.notes = notes
    inspection.updatedAt = now

    // Update underlying RMA status to INSPECTED in memory
    const rma = registeredRmas.get(inspection.returnNumber)
    if (rma) {
      rma.status = 'INSPECTED'
    }

    // Update DB if configured
    if (isDatabaseConfigured) {
      try {
        await (db.orm.public.ReturnRequest as any).where({ returnNumber: inspection.returnNumber }).update({
          status: 'INSPECTED',
          inspectedAt: new Date(now),
        })
      } catch (err) {
        console.warn('[ReturnInspectionService] DB complete return failed:', err)
      }
    }

    return inspection
  }
}
