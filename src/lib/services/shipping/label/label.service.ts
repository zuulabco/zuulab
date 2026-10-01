import 'server-only'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { logAuditEvent } from '@/lib/services/admin.service'
import { LabelRenderer } from './label-renderer'
import type {
  ShippingLabelFormat,
  ShippingLabelResult,
  ShippingShipmentRecord,
} from '../shipping-types'
import { CargoNotFoundError, CargoLabelError } from '../shipping-error'

// In-memory label storage fallback
const inMemoryLabels: Map<string, ShippingLabelResult[]> = new Map()

export class LabelService {
  /**
   * Generates or retrieves a shipping label with strict versioning and immutability
   */
  public static async generateLabel(
    shipment: ShippingShipmentRecord,
    format: ShippingLabelFormat = 'PDF',
    regenerate = false
  ): Promise<ShippingLabelResult> {
    if (!shipment.trackingNumber) {
      throw new CargoLabelError(
        'Takip numarası bulunmayan gönderi için etiket oluşturulamaz.',
        false,
        shipment.provider
      )
    }

    // Check existing labels for this shipment
    const existingLabels = await this.getLabelsForShipment(shipment.id)
    const latestLabel = existingLabels.sort((a, b) => b.version - a.version)[0]

    // If label exists and regeneration is not requested, return existing (Idempotent)
    if (latestLabel && !regenerate) {
      return latestLabel
    }

    const nextVersion = latestLabel ? latestLabel.version + 1 : 1
    const fileExt = format.toLowerCase()
    const storageKey = `labels/${shipment.id}/v${nextVersion}.${fileExt}`

    // Render using LabelRenderer
    const rendered = LabelRenderer.render(
      {
        shipmentId: shipment.id,
        trackingNumber: shipment.trackingNumber,
        carrier: shipment.carrier,
        orderNumber: shipment.orderNumber || shipment.marketplaceOrderNumber || shipment.id,
        marketplaceOrderNumber: shipment.marketplaceOrderNumber,
        channel: shipment.channel,
        recipient: shipment.shippingAddress,
        packageNumber: shipment.externalShipmentId,
        packageCount: shipment.packageCount,
        totalWeightKg: shipment.totalWeightKg,
        serviceType: shipment.serviceType,
      },
      format
    )

    const labelId = `lbl_${shipment.id}_v${nextVersion}`
    const labelResult: ShippingLabelResult = {
      labelId,
      shipmentId: shipment.id,
      version: nextVersion,
      format,
      status: 'READY',
      storageKey,
      mimeType: rendered.mimeType,
      widthMm: rendered.widthMm,
      heightMm: rendered.heightMm,
      barcodePayload: shipment.trackingNumber,
      checksum: rendered.checksum,
      data: rendered.data,
      createdAt: new Date().toISOString(),
    }

    // Persist in DB or in-memory
    if (isDatabaseConfigured) {
      try {
        await (db.orm.public as any).ShippingLabel.create({
          id: labelId,
          shipmentId: shipment.id,
          version: nextVersion,
          format,
          status: 'READY',
          storageKey,
          mimeType: rendered.mimeType,
          widthMm: rendered.widthMm,
          heightMm: rendered.heightMm,
          barcodePayload: shipment.trackingNumber,
          checksum: rendered.checksum,
          data: rendered.data,
        })

        // Point shipment to newest label
        await (db.orm.public as any).ShippingShipment.where({ id: shipment.id }).update({
          currentLabelId: labelId,
        })
      } catch (err) {
        console.warn('[LabelService] DB persistence fallback to memory:', err)
      }
    }

    // Memory cache
    const currentList = inMemoryLabels.get(shipment.id) || []
    currentList.push(labelResult)
    inMemoryLabels.set(shipment.id, currentList)

    await logAuditEvent({
      action: regenerate ? 'shipping.label.regenerated' : 'shipping.label.created',
      entity: 'ShippingLabel',
      entityId: labelId,
      metadata: {
        shipmentId: shipment.id,
        trackingNumber: shipment.trackingNumber,
        version: nextVersion,
        format,
        storageKey,
        checksum: rendered.checksum,
      },
    })

    return labelResult
  }

  /**
   * Retrieves all historical versions of labels for a shipment
   */
  public static async getLabelsForShipment(shipmentId: string): Promise<ShippingLabelResult[]> {
    if (isDatabaseConfigured) {
      try {
        const records = await (db.orm.public as any).ShippingLabel.findMany({
          where: { shipmentId },
          orderBy: { version: 'desc' },
        })
        if (records && records.length > 0) {
          return records.map((r: any) => ({
            labelId: r.id,
            shipmentId: r.shipmentId,
            version: r.version,
            format: r.format as ShippingLabelFormat,
            status: r.status,
            storageKey: r.storageKey,
            mimeType: r.mimeType,
            widthMm: r.widthMm,
            heightMm: r.heightMm,
            barcodePayload: r.barcodePayload,
            checksum: r.checksum,
            data: r.data,
            createdAt: r.createdAt?.toISOString?.() ?? new Date().toISOString(),
          }))
        }
      } catch {}
    }

    return inMemoryLabels.get(shipmentId) || []
  }

  /**
   * Retrieves a specific label by labelId
   */
  public static async getLabelById(labelId: string): Promise<ShippingLabelResult> {
    if (isDatabaseConfigured) {
      try {
        const r = await (db.orm.public as any).ShippingLabel.findUnique({
          where: { id: labelId },
        })
        if (r) {
          return {
            labelId: r.id,
            shipmentId: r.shipmentId,
            version: r.version,
            format: r.format as ShippingLabelFormat,
            status: r.status,
            storageKey: r.storageKey,
            mimeType: r.mimeType,
            widthMm: r.widthMm,
            heightMm: r.heightMm,
            barcodePayload: r.barcodePayload,
            checksum: r.checksum,
            data: r.data,
            createdAt: r.createdAt?.toISOString?.() ?? new Date().toISOString(),
          }
        }
      } catch {}
    }

    for (const list of inMemoryLabels.values()) {
      const found = list.find((l) => l.labelId === labelId)
      if (found) return found
    }

    throw new CargoNotFoundError(`Etiket '${labelId}' bulunamadı.`)
  }

  /**
   * Generates a combined multi-label PDF document for multiple shipments
   */
  public static async generateCombinedLabelsPdf(
    shipments: ShippingShipmentRecord[]
  ): Promise<{ data: string; mimeType: string; totalPages: number }> {
    const renderOptions = shipments.map((s) => ({
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
    return {
      data: combined.data,
      mimeType: combined.mimeType,
      totalPages: shipments.length,
    }
  }
}
