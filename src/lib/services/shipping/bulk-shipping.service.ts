import 'server-only'
import { ShippingService } from './shipping.service'
import { LabelService } from './label/label.service'
import { LabelRenderer } from './label/label-renderer'
import { updateOrderStatus, getAllOrders, getOrderByNumber } from '../orders.service'
import { PrintAgentService } from '../warehouse/print-agent.service'
import { logAuditEvent } from '../admin.service'
import type { ShippingShipmentRecord, ShippingLabelResult } from './shipping-types'

export const MAX_BULK_LIMIT = 50

export interface BulkLabelItemResult {
  shipmentId: string
  orderNumber: string | null
  success: boolean
  labelId?: string
  trackingNumber?: string
  error?: string
}

export interface BulkLabelResponse {
  success: boolean
  totalRequested: number
  successCount: number
  failedCount: number
  results: BulkLabelItemResult[]
  combinedPdf?: {
    data: string // Base64 encoded vector PDF
    mimeType: string
    totalPages: number
    filename: string
  } | null
  printJobId?: string | null
}

export interface BulkShipItemResult {
  shipmentId: string
  orderNumber: string | null
  success: boolean
  previousStatus?: string
  newStatus?: string
  idempotent?: boolean
  error?: string
}

export interface BulkShipResponse {
  success: boolean
  totalRequested: number
  successCount: number
  failedCount: number
  results: BulkShipItemResult[]
}

export interface ShippingDailyStats {
  kargoyaHazir: number
  etiketHazir: number
  etiketBekliyor: number
  kargoyaVerildi: number
  todayTotal: number
}

export class BulkShippingService {
  /**
   * Bulk Label Generation with Strict Idempotency, Store Isolation, and Partial Failure Support
   */
  public static async bulkGenerateLabels(input: {
    shipmentIds: string[]
    storeId?: string | null
    printerId?: string | null
    adminUserId?: string
  }): Promise<BulkLabelResponse> {
    const { shipmentIds, storeId, printerId, adminUserId } = input

    if (!Array.isArray(shipmentIds) || shipmentIds.length === 0) {
      throw new Error('BULK_LABEL_ERROR: En az bir gönderi kimliği (shipmentIds) belirtilmelidir.')
    }

    if (shipmentIds.length > MAX_BULK_LIMIT) {
      throw new Error(
        `BULK_LABEL_ERROR: Tek seferde en fazla ${MAX_BULK_LIMIT} adet etiket toplu oluşturulabilir. (İstenen: ${shipmentIds.length})`
      )
    }

    const results: BulkLabelItemResult[] = []
    const successfulShipments: ShippingShipmentRecord[] = []
    let detectedStoreId: string | null = storeId || null

    for (const shipmentId of shipmentIds) {
      try {
        const shipment = await ShippingService.getShipmentById(shipmentId)

        // 1. Multi-Store Isolation Check
        if (detectedStoreId && shipment.storeId && shipment.storeId !== detectedStoreId) {
          results.push({
            shipmentId,
            orderNumber: shipment.orderNumber || shipment.marketplaceOrderNumber,
            success: false,
            error: 'Mağaza İzolasyonu: Farklı mağazalara ait gönderiler tek bir toplu işlemde birleştirilemez.',
          })
          continue
        }

        if (!detectedStoreId && shipment.storeId) {
          detectedStoreId = shipment.storeId
        }

        // 2. Shipment Status Check
        if (shipment.status === 'CANCELLED') {
          results.push({
            shipmentId,
            orderNumber: shipment.orderNumber || shipment.marketplaceOrderNumber,
            success: false,
            error: 'İptal edilmiş gönderi için etiket oluşturulamaz.',
          })
          continue
        }

        if (!shipment.trackingNumber) {
          results.push({
            shipmentId,
            orderNumber: shipment.orderNumber || shipment.marketplaceOrderNumber,
            success: false,
            error: 'Gönderiye ait takip numarası bulunmuyor. Önce kargo kaydı oluşturulmalıdır.',
          })
          continue
        }

        // 3. Generate or retrieve label idempotently (LabelService.generateLabel is idempotent)
        // INVARIANT: Generating a label NEVER decrements physical stock!
        const label = await LabelService.generateLabel(shipment, 'PDF', false)

        results.push({
          shipmentId,
          orderNumber: shipment.orderNumber || shipment.marketplaceOrderNumber,
          success: true,
          labelId: label.labelId,
          trackingNumber: shipment.trackingNumber,
        })

        successfulShipments.push(shipment)
      } catch (err: any) {
        results.push({
          shipmentId,
          orderNumber: null,
          success: false,
          error: err.message || 'Etiket üretimi sırasında beklenmeyen hata oluştu.',
        })
      }
    }

    const successCount = results.filter((r) => r.success).length
    const failedCount = results.filter((r) => !r.success).length

    // Generate combined 100x100mm multi-page PDF if any labels succeeded
    let combinedPdf: BulkLabelResponse['combinedPdf'] = null
    if (successfulShipments.length > 0) {
      const renderOptions = successfulShipments.map((s) => ({
        shipmentId: s.id,
        trackingNumber: s.trackingNumber || `TRK-${s.id.slice(-6)}`,
        carrier: s.carrier,
        orderNumber: s.orderNumber || s.marketplaceOrderNumber || s.id,
        marketplaceOrderNumber: s.marketplaceOrderNumber,
        channel: s.channel,
        recipient: s.shippingAddress,
        packageNumber: s.externalShipmentId,
        packageCount: s.packageCount,
        totalWeightKg: s.totalWeightKg,
        serviceType: s.serviceType,
      }))

      const combined = LabelRenderer.combinePdfLabels(renderOptions)
      combinedPdf = {
        data: combined.data,
        mimeType: combined.mimeType,
        totalPages: successfulShipments.length,
        filename: `toplu-etiket-${new Date().toISOString().slice(0, 10)}-${Date.now()}.pdf`,
      }
    }

    // Optional Print Agent Dispatch
    let printJobId: string | null = null
    if (printerId && combinedPdf && successfulShipments.length > 0) {
      try {
        const printer = await PrintAgentService.getPrinter(printerId)
        const job = await PrintAgentService.requestPrintJob({
          printerId: printer.id,
          shipmentId: successfulShipments[0].id,
          labelId: successfulShipments[0].currentLabelId || undefined,
          labelVersion: 'bulk-p27',
          format: 'PDF',
          requestedBy: adminUserId || 'system',
        })
        printJobId = job.job.id
      } catch (printErr) {
        console.warn('[BulkShippingService] Print agent dispatch failed:', printErr)
      }
    }

    await logAuditEvent({
      action: 'shipping.bulk.labels_generated',
      entity: 'ShippingShipment',
      entityId: `bulk_${Date.now()}`,
      metadata: {
        totalRequested: shipmentIds.length,
        successCount,
        failedCount,
        adminUserId,
      },
    }).catch(() => {})

    return {
      success: successCount > 0,
      totalRequested: shipmentIds.length,
      successCount,
      failedCount,
      results,
      combinedPdf,
      printJobId,
    }
  }

  /**
   * Bulk Mark as Shipped (Kargoya Verildi)
   *
   * Validates state, tracking number, triggers physical inventory commit authoritatively on SHIPPED,
   * updates order status if direct order, and supports idempotency and partial failures.
   */
  public static async bulkMarkAsShipped(input: {
    shipmentIds: string[]
    storeId?: string | null
    adminUserId?: string
  }): Promise<BulkShipResponse> {
    const { shipmentIds, storeId, adminUserId = 'system' } = input

    if (!Array.isArray(shipmentIds) || shipmentIds.length === 0) {
      throw new Error('BULK_SHIP_ERROR: En az bir gönderi kimliği (shipmentIds) belirtilmelidir.')
    }

    if (shipmentIds.length > MAX_BULK_LIMIT) {
      throw new Error(
        `BULK_SHIP_ERROR: Tek seferde en fazla ${MAX_BULK_LIMIT} adet gönderi kargoya verilebilir. (İstenen: ${shipmentIds.length})`
      )
    }

    const results: BulkShipItemResult[] = []
    let detectedStoreId: string | null = storeId || null

    for (const shipmentId of shipmentIds) {
      try {
        const shipment = await ShippingService.getShipmentById(shipmentId)

        // 1. Multi-Store Isolation Check
        if (detectedStoreId && shipment.storeId && shipment.storeId !== detectedStoreId) {
          results.push({
            shipmentId,
            orderNumber: shipment.orderNumber || shipment.marketplaceOrderNumber,
            success: false,
            error: 'Mağaza İzolasyonu: Farklı mağazaya ait gönderi sevk edilemez.',
          })
          continue
        }

        if (!detectedStoreId && shipment.storeId) {
          detectedStoreId = shipment.storeId
        }

        // 2. Idempotency Check: If already SHIPPED, return success as safe no-op
        if (shipment.status === 'SHIPPED') {
          results.push({
            shipmentId,
            orderNumber: shipment.orderNumber || shipment.marketplaceOrderNumber,
            success: true,
            previousStatus: 'SHIPPED',
            newStatus: 'SHIPPED',
            idempotent: true,
          })
          continue
        }

        // 3. State transition validity check
        if (
          shipment.status === 'CANCELLED' ||
          shipment.status === 'DELIVERED' ||
          shipment.status === 'RETURNED'
        ) {
          results.push({
            shipmentId,
            orderNumber: shipment.orderNumber || shipment.marketplaceOrderNumber,
            success: false,
            previousStatus: shipment.status,
            error: `'${shipment.status}' durumundaki gönderi 'SHIPPED' durumuna geçirilemez.`,
          })
          continue
        }

        // 4. Tracking number presence check
        if (!shipment.trackingNumber) {
          results.push({
            shipmentId,
            orderNumber: shipment.orderNumber || shipment.marketplaceOrderNumber,
            success: false,
            previousStatus: shipment.status,
            error: 'Takip numarası bulunmayan gönderi kargoya verilemez.',
          })
          continue
        }

        const prevStatus = shipment.status

        // 5. Update shipment to SHIPPED. ShippingService authoritative commit triggers inventory commit here!
        await ShippingService.updateShipmentStatus(shipmentId, 'SHIPPED', {
          description: `Toplu sevk işlemi (${adminUserId})`,
        })

        // 6. Update direct order status if direct storefront order
        if (shipment.orderNumber && shipment.channel !== 'MARKETPLACE') {
          try {
            await updateOrderStatus(
              shipment.orderNumber,
              'SHIPPED',
              `Kargoya verildi. Takip No: ${shipment.trackingNumber} (${shipment.carrier})`,
              adminUserId
            )
          } catch (ordErr) {
            console.warn('[BulkShippingService] Direct order status update notice:', ordErr)
          }
        }

        results.push({
          shipmentId,
          orderNumber: shipment.orderNumber || shipment.marketplaceOrderNumber,
          success: true,
          previousStatus: prevStatus,
          newStatus: 'SHIPPED',
          idempotent: false,
        })
      } catch (err: any) {
        results.push({
          shipmentId,
          orderNumber: null,
          success: false,
          error: err.message || 'Gönderi sevk edilirken hata oluştu.',
        })
      }
    }

    const successCount = results.filter((r) => r.success).length
    const failedCount = results.filter((r) => !r.success).length

    await logAuditEvent({
      action: 'shipping.bulk.marked_as_shipped',
      entity: 'ShippingShipment',
      entityId: `bulk_ship_${Date.now()}`,
      metadata: {
        totalRequested: shipmentIds.length,
        successCount,
        failedCount,
        adminUserId,
      },
    }).catch(() => {})

    return {
      success: successCount > 0,
      totalRequested: shipmentIds.length,
      successCount,
      failedCount,
      results,
    }
  }

  /**
   * Calculates real daily shipping operational metrics from database/service state
   */
  public static async getDailyShippingStats(storeId?: string | null): Promise<ShippingDailyStats> {
    const shipments = await ShippingService.listShipments({
      storeId: storeId || undefined,
    })

    const todayStr = new Date().toISOString().slice(0, 10)

    let kargoyaHazir = 0
    let etiketHazir = 0
    let etiketBekliyor = 0
    let kargoyaVerildi = 0

    for (const s of shipments) {
      if (s.status === 'PENDING' || s.status === 'READY_TO_SHIP') {
        kargoyaHazir++
        if (!s.currentLabelId) {
          etiketBekliyor++
        } else {
          etiketHazir++
        }
      } else if (s.status === 'LABEL_REQUESTED') {
        etiketBekliyor++
        kargoyaHazir++
      } else if (s.status === 'LABEL_READY' || s.status === 'SHIPMENT_CREATED') {
        etiketHazir++
        kargoyaHazir++
      } else if (s.status === 'SHIPPED' || s.status === 'IN_TRANSIT' || s.status === 'DELIVERED') {
        const isToday =
          (s.shippedAt && s.shippedAt.slice(0, 10) === todayStr) ||
          (s.createdAt && s.createdAt.slice(0, 10) === todayStr)
        if (isToday) {
          kargoyaVerildi++
        }
      }
    }

    return {
      kargoyaHazir,
      etiketHazir,
      etiketBekliyor,
      kargoyaVerildi,
      todayTotal: kargoyaHazir + kargoyaVerildi,
    }
  }
}
