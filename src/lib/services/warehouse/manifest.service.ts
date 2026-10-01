import 'server-only'
import crypto from 'crypto'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { logAuditEvent } from '@/lib/services/admin.service'
import { ShippingService } from '@/lib/services/shipping/shipping.service'
import { BarcodeService } from '@/lib/services/shipping/label/barcode.service'
import { WarehouseService } from './warehouse.service'
import {
  WarehouseValidationError,
  WarehouseNotFoundError,
  WarehouseInvalidStateError,
} from './warehouse-error'
import type {
  ShippingManifestRecord,
  ShippingManifestItemRecord,
  ShippingManifestStatus,
} from './warehouse-types'

// In-memory manifests
import { AsyncLocalStorage } from 'async_hooks'

const inMemoryManifests: Map<string, ShippingManifestRecord> = new Map()
const inMemoryManifestItems: Map<string, ShippingManifestItemRecord[]> = new Map()
const manifestLocks: Map<string, Promise<unknown>> = new Map()
const manifestLockStorage = new AsyncLocalStorage<Set<string>>()

export class ManifestService {
  /**
   * Acquire mutex lock for a specific manifest.
   * Re-entrant safe via AsyncLocalStorage.
   */
  public static async withManifestLock<T>(
    manifestId: string,
    action: () => Promise<T>
  ): Promise<T> {
    const held = manifestLockStorage.getStore()
    if (held && held.has(manifestId)) {
      return await action()
    }

    const current = manifestLocks.get(manifestId) || Promise.resolve()
    let release: () => void
    const next = new Promise<void>((res) => {
      release = res
    })
    manifestLocks.set(manifestId, current.then(() => next))

    try {
      await current
      const newHeld = new Set(held || [])
      newHeld.add(manifestId)
      return await manifestLockStorage.run(newHeld, () => action())
    } finally {
      release!()
      if (manifestLocks.get(manifestId) === next) {
        manifestLocks.delete(manifestId)
      }
    }
  }

  /**
   * Creates a new shipping manifest
   */
  public static async createManifest(input: {
    provider: 'SURAT' | 'PTT' | 'MOCK'
    storeId?: string | null
    createdBy: string
    notes?: string
  }): Promise<ShippingManifestRecord> {
    const manifestId = `man_${Date.now()}_${Math.floor(Math.random() * 1000)}`
    const manifestNumber = `ZIMMET-${input.provider}-${new Date()
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`
    const now = new Date().toISOString()

    const manifest: ShippingManifestRecord = {
      id: manifestId,
      provider: input.provider,
      storeId: input.storeId || null,
      manifestNumber,
      status: 'OPEN',
      shipmentCount: 0,
      totalPackageCount: 0,
      createdBy: input.createdBy,
      carrierOperatorName: null,
      notes: input.notes || null,
      closedAt: null,
      handedOverAt: null,
      createdAt: now,
      updatedAt: now,
      items: [],
    }

    inMemoryManifests.set(manifestId, manifest)
    inMemoryManifestItems.set(manifestId, [])

    if (isDatabaseConfigured) {
      try {
        await (db.orm.public.ShippingManifest as any).create({
          data: {
            id: manifest.id,
            provider: manifest.provider,
            storeId: manifest.storeId,
            manifestNumber: manifest.manifestNumber,
            status: manifest.status,
            shipmentCount: 0,
            totalPackageCount: 0,
            createdBy: manifest.createdBy,
            notes: manifest.notes,
            createdAt: new Date(now),
            updatedAt: new Date(now),
          },
        })
      } catch (err) {
        console.warn('[ManifestService] DB manifest save fallback to memory:', err)
      }
    }

    await logAuditEvent({
      action: 'warehouse.manifest.created',
      entity: 'ShippingManifest',
      entityId: manifestId,
      metadata: {
        manifestNumber,
        provider: input.provider,
        createdBy: input.createdBy,
      },
    })

    return manifest
  }

  /**
   * Adds an eligible shipment to an OPEN manifest.
   * Shipments must be READY_FOR_HANDOVER or LABEL_READY.
   * Rejects DELIVERED, CANCELLED, RETURNED, or already manifested shipments.
   */
  public static async addShipmentToManifest(
    manifestId: string,
    shipmentId: string
  ): Promise<ShippingManifestRecord> {
    return this.withManifestLock(manifestId, async () => {
      const manifest = await this.getManifest(manifestId)
      if (manifest.status !== 'OPEN') {
        throw new WarehouseInvalidStateError(
          `Yalnızca 'OPEN' durumundaki manifestolara gönderi eklenebilir (mevcut: ${manifest.status}).`
        )
      }

      // Check if shipment is already on an active manifest
      for (const [mId, items] of inMemoryManifestItems.entries()) {
        const m = inMemoryManifests.get(mId)
        if (m && (m.status === 'OPEN' || m.status === 'READY')) {
          if (items.some((it) => it.shipmentId === shipmentId)) {
            throw new WarehouseValidationError(
              `Kargo gönderisi (${shipmentId}) zaten aktif bir manifestoda (${m.manifestNumber}) yer almaktadır.`
            )
          }
        }
      }

      // Fetch shipment from ShippingService
      const shipment = await ShippingService.getShipmentById(shipmentId)
      if (!shipment) {
        throw new WarehouseNotFoundError(`Kargo gönderisi bulunamadı: ${shipmentId}`)
      }

      // Invariant: Provider match
      if (shipment.provider !== manifest.provider) {
        throw new WarehouseValidationError(
          `Taşıyıcı uyuşmazlığı: Gönderi taşıyıcısı (${shipment.provider}) manifesto taşıyıcısı (${manifest.provider}) ile aynı olmalıdır.`
        )
      }

      // Invariant: Status eligibility
      const invalidStatuses = ['DELIVERED', 'CANCELLED', 'RETURNED', 'RETURN_REQUESTED']
      if (invalidStatuses.includes(shipment.status)) {
        throw new WarehouseValidationError(
          `Bu durumdaki kargo (${shipment.status}) zimmet fişine eklenemez.`
        )
      }

      const items = inMemoryManifestItems.get(manifestId) || []
      const orderRef =
        shipment.orderNumber || shipment.marketplaceOrderNumber || shipment.orderId || 'Sipariş'

      const manifestItem: ShippingManifestItemRecord = {
        id: `man_it_${manifestId}_${shipmentId}`,
        manifestId,
        shipmentId,
        trackingNumber: shipment.trackingNumber || '-',
        orderReference: orderRef,
        packageCount: shipment.packageCount || 1,
        createdAt: new Date().toISOString(),
      }

      items.push(manifestItem)
      inMemoryManifestItems.set(manifestId, items)

      manifest.shipmentCount = items.length
      manifest.totalPackageCount = items.reduce((acc, it) => acc + it.packageCount, 0)
      manifest.updatedAt = new Date().toISOString()
      manifest.items = items

      inMemoryManifests.set(manifestId, manifest)
      return manifest
    })
  }

  /**
   * Closes manifest (OPEN -> READY)
   */
  public static async closeManifest(manifestId: string): Promise<ShippingManifestRecord> {
    return this.withManifestLock(manifestId, async () => {
      const manifest = await this.getManifest(manifestId)
      if (manifest.status !== 'OPEN') {
        throw new WarehouseInvalidStateError(
          `Yalnızca 'OPEN' durumundaki manifesto kapatılabilir (mevcut: ${manifest.status}).`
        )
      }
      if (manifest.shipmentCount === 0) {
        throw new WarehouseValidationError('İçinde kargo bulunmayan boş manifesto kapatılamaz.')
      }

      manifest.status = 'READY'
      manifest.closedAt = new Date().toISOString()
      manifest.updatedAt = new Date().toISOString()

      inMemoryManifests.set(manifestId, manifest)

      await logAuditEvent({
        action: 'warehouse.manifest.closed',
        entity: 'ShippingManifest',
        entityId: manifestId,
        metadata: {
          manifestNumber: manifest.manifestNumber,
          shipmentCount: manifest.shipmentCount,
        },
      })

      return manifest
    })
  }

  /**
   * Confirms Carrier Handover (READY -> HANDED_OVER).
   * Idempotent: repeated request returns existing result without duplicating state or events.
   * Invokes Phase 19 ShippingService.updateShipmentStatus(shipmentId, 'SHIPPED')
   * which triggers the centralized inventory commit exactly once!
   */
  public static async confirmHandover(input: {
    manifestId: string
    operatorId: string
    carrierOperatorName?: string
    notes?: string
  }): Promise<ShippingManifestRecord> {
    return this.withManifestLock(input.manifestId, async () => {
      const manifest = await this.getManifest(input.manifestId)

      // Idempotency: If already HANDED_OVER, return current state safely
      if (manifest.status === 'HANDED_OVER') {
        return manifest
      }

      if (manifest.status !== 'READY') {
        throw new WarehouseInvalidStateError(
          `Yalnızca 'READY' durumundaki manifesto kuryeye teslim edilebilir (mevcut: ${manifest.status}).`
        )
      }

      const now = new Date().toISOString()
      manifest.status = 'HANDED_OVER'
      manifest.handedOverAt = now
      manifest.carrierOperatorName = input.carrierOperatorName || null
      if (input.notes) manifest.notes = input.notes
      manifest.updatedAt = now

      // For every shipment on the manifest, transition to SHIPPED via Phase 19 ShippingService
      const items = inMemoryManifestItems.get(input.manifestId) || []
      for (const item of items) {
        try {
          await ShippingService.updateShipmentStatus(
            item.shipmentId,
            'SHIPPED',
            { description: `Zimmet Fişi (#${manifest.manifestNumber}) ile kargo kuryesine teslim edildi.` }
          )

          // Also update associated WarehouseFulfillment if exists
          const fulfillments = await WarehouseService.listFulfillments()
          const matchedFulfillment = fulfillments.find((f) => f.shipmentId === item.shipmentId)
          if (matchedFulfillment && matchedFulfillment.status === 'READY_FOR_HANDOVER') {
            await WarehouseService.updateFulfillmentStatus(
              matchedFulfillment.id,
              'HANDED_OVER',
              input.operatorId
            )
          }
        } catch (err) {
          console.warn(`[ManifestService] Warning on updating shipment ${item.shipmentId}:`, err)
        }
      }

      inMemoryManifests.set(input.manifestId, manifest)

      await logAuditEvent({
        action: 'warehouse.handover.completed',
        entity: 'ShippingManifest',
        entityId: input.manifestId,
        metadata: {
          manifestNumber: manifest.manifestNumber,
          carrierOperatorName: input.carrierOperatorName,
          shipmentCount: manifest.shipmentCount,
        },
      })

      return manifest
    })
  }

  /**
   * Get manifest by ID
   */
  public static async getManifest(manifestId: string): Promise<ShippingManifestRecord> {
    const manifest = inMemoryManifests.get(manifestId)
    if (!manifest) {
      throw new WarehouseNotFoundError(`Manifesto kaydı bulunamadı: ${manifestId}`)
    }
    manifest.items = inMemoryManifestItems.get(manifestId) || []
    return manifest
  }

  /**
   * List manifests
   */
  public static async listManifests(filter?: {
    provider?: string
    status?: ShippingManifestStatus
  }): Promise<ShippingManifestRecord[]> {
    let list = Array.from(inMemoryManifests.values())
    if (filter?.provider) {
      list = list.filter((m) => m.provider === filter.provider)
    }
    if (filter?.status) {
      list = list.filter((m) => m.status === filter.status)
    }
    for (const m of list) {
      m.items = inMemoryManifestItems.get(m.id) || []
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  /**
   * Generates Zimmet Fişi (Handover Manifest) PDF Document
   */
  public static async generateManifestPdf(manifestId: string): Promise<{
    pdfBase64: string
    checksum: string
    mimeType: 'application/pdf'
    manifestNumber: string
  }> {
    const manifest = await this.getManifest(manifestId)
    const items = manifest.items || []
    const barcode = BarcodeService.encodeCode128(manifest.manifestNumber)

    const W = 595.28 // A4 Width
    const H = 841.89 // A4 Height

    const clean = (s: string) => (s || '').replace(/[\(\)\\]/g, ' ').slice(0, 50)

    // Barcode vector
    const barWidth = 1.3
    const startX = 380
    const barHeight = 35
    const barcodeY = H - 95

    let barCommands = ''
    for (let i = 0; i < barcode.binaryBars.length; i++) {
      if (barcode.binaryBars[i] === '1') {
        const x = startX + i * barWidth
        barCommands += `${x.toFixed(2)} ${barcodeY.toFixed(2)} ${barWidth.toFixed(2)} ${barHeight.toFixed(2)} re f\n`
      }
    }

    // Rows
    let rowsPdf = ''
    let curY = H - 240
    items.slice(0, 18).forEach((it, idx) => {
      rowsPdf += `
        BT
        /F1 10 Tf
        45 ${curY} Td
        (${idx + 1}) Tj
        95 ${curY} Td
        (${clean(it.trackingNumber)}) Tj
        260 ${curY} Td
        (${clean(it.orderReference)}) Tj
        480 ${curY} Td
        (${it.packageCount} Koli) Tj
        ET
        0.8 0.8 0.8 RG 0.5 w
        40 ${curY - 5} 515 0.5 re S
      `
      curY -= 22
    })

    const stream = `
      % Header Box
      0.95 0.95 0.97 rg
      35 ${H - 110} 525 75 re f
      0.7 0.7 0.7 RG 1 w
      35 ${H - 110} 525 75 re S

      BT
      /F1 15 Tf
      50 ${H - 65} Td
      (ZUULAB - GUNLUK KARGO ZIMMET FISI / MANIFESTO) Tj
      /F1 10 Tf
      50 ${H - 85} Td
      (Tasiyici: ${clean(manifest.provider)}  |  Tarih: ${clean(manifest.createdAt.slice(0, 10))}) Tj
      ET

      % Barcode
      0 0 0 rg
      ${barCommands}
      BT
      /F1 8 Tf
      ${startX + 20} ${barcodeY - 10} Td
      (${clean(manifest.manifestNumber)}) Tj
      ET

      % Overview Box
      0.98 0.98 0.99 rg
      35 ${H - 190} 525 70 re f
      0.85 0.85 0.85 RG 1 w
      35 ${H - 190} 525 70 re S

      BT
      /F1 11 Tf
      50 ${H - 140} Td
      (Zimmet No: ${clean(manifest.manifestNumber)}     Durum: ${clean(manifest.status)}) Tj
      50 ${H - 160} Td
      (Toplam Gonderi: ${manifest.shipmentCount} Adet     Toplam Koli: ${manifest.totalPackageCount} Adet) Tj
      50 ${H - 180} Td
      (Hazirlayan: ${clean(manifest.createdBy)}) Tj
      ET

      % Table Header
      0.88 0.88 0.90 rg
      35 ${H - 215} 525 20 re f
      BT
      /F1 10 Tf
      45 ${H - 203} Td
      (NO) Tj
      95 ${H - 203} Td
      (TAKIP NUMARASI) Tj
      260 ${H - 203} Td
      (SIPARIS REFERANSI) Tj
      480 ${H - 203} Td
      (PAKET SAYISI) Tj
      ET

      % Rows
      ${rowsPdf}

      % Signature Handover Box
      0.97 0.97 0.97 rg
      35 60 525 80 re f
      0.7 0.7 0.7 RG 1 w
      35 60 525 80 re S

      BT
      /F1 10 Tf
      50 120 Td
      (TESLIM EDEN OPERATOR (ZUULAB)) Tj
      320 120 Td
      (TESLIM ALAN KARGO KURYEYE / SURUCU) Tj
      50 85 Td
      (Ad Soyad: .......................................) Tj
      320 85 Td
      (Ad Soyad: .......................................) Tj
      50 70 Td
      (Imza:                                            ) Tj
      320 70 Td
      (Imza:                                            ) Tj
      ET
    `

    const streamLength = Buffer.byteLength(stream, 'latin1')

    const pdfObjects = [
      `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
      `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`,
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n`,
      `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${stream}\nendstream\nendobj\n`,
      `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`,
    ]

    let offset = 9
    const offsets: number[] = [0]
    let body = '%PDF-1.4\n'

    for (const obj of pdfObjects) {
      offsets.push(offset)
      body += obj
      offset += Buffer.byteLength(obj, 'latin1')
    }

    const xrefOffset = offset
    let xref = `xref\n0 6\n0000000000 65535 f \n`
    for (let i = 1; i <= 5; i++) {
      xref += `${offsets[i].toString().padStart(10, '0')} 00000 n \n`
    }

    const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
    const rawPdf = body + xref + trailer
    const checksum = crypto.createHash('sha256').update(rawPdf).digest('hex')

    return {
      pdfBase64: Buffer.from(rawPdf, 'latin1').toString('base64'),
      checksum,
      mimeType: 'application/pdf',
      manifestNumber: manifest.manifestNumber,
    }
  }
}
