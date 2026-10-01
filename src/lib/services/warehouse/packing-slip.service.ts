import 'server-only'
import crypto from 'crypto'
import { BarcodeService } from '@/lib/services/shipping/label/barcode.service'
import { WarehouseService } from './warehouse.service'
import { ShippingService } from '@/lib/services/shipping/shipping.service'
import { WarehouseNotFoundError } from './warehouse-error'

export interface PackingSlipDocument {
  fulfillmentId: string
  orderNumber: string
  channel: string
  trackingNumber: string | null
  carrier: string | null
  pdfBase64: string
  checksum: string
  mimeType: 'application/pdf'
}

export class PackingSlipService {
  /**
   * Masks telephone number for PII defense in warehouse paperwork
   * Example: "05321112233" -> "0532 *** ** 33"
   */
  public static maskPhone(phone?: string | null): string {
    if (!phone) return '-'
    const clean = phone.replace(/\s+/g, '')
    if (clean.length < 8) return '***'
    return `${clean.slice(0, 4)} *** ** ${clean.slice(-2)}`
  }

  /**
   * Generates a standard A4 (595.28 x 841.89 pt) Packing Slip PDF
   */
  public static async generatePackingSlip(fulfillmentId: string): Promise<PackingSlipDocument> {
    const fulfillment = await WarehouseService.getFulfillment(fulfillmentId)
    if (!fulfillment) {
      throw new WarehouseNotFoundError(`Fulfillment kaydı bulunamadı: ${fulfillmentId}`)
    }

    const shipment = fulfillment.shipmentId
      ? await ShippingService.getShipmentById(fulfillment.shipmentId)
      : null

    const orderNumber =
      fulfillment.orderNumber || fulfillment.marketplaceOrderNumber || fulfillment.id
    const channel = fulfillment.channel
    const carrier = shipment?.carrier || 'Standart Kargo'
    const trackingNumber = shipment?.trackingNumber || null
    const recipientName = shipment?.recipientName || 'Müşteri'
    const recipientPhone = this.maskPhone(shipment?.recipientPhone)
    const recipientAddress = shipment?.shippingAddress
      ? `${(shipment.shippingAddress as any).district || ''} / ${(shipment.shippingAddress as any).city || ''}`
      : 'Türkiye'

    const items = fulfillment.items || []

    // Barcode for order / tracking
    const codeToEncode = trackingNumber || orderNumber
    const barcode = BarcodeService.encodeCode128(codeToEncode)

    // Build vector PDF stream
    const pdfData = this.buildPackingSlipPdf({
      orderNumber,
      channel,
      carrier,
      trackingNumber,
      recipientName,
      recipientPhone,
      recipientAddress,
      items: items.map((i) => ({
        sku: i.sku,
        name: i.productNameSnapshot,
        quantity: i.orderedQuantity,
        packedQuantity: i.packedQuantity,
      })),
      binaryBars: barcode.binaryBars,
      barcodeText: codeToEncode,
      createdAt: fulfillment.createdAt,
    })

    const checksum = crypto.createHash('sha256').update(pdfData).digest('hex')

    return {
      fulfillmentId,
      orderNumber,
      channel,
      trackingNumber,
      carrier,
      pdfBase64: Buffer.from(pdfData, 'latin1').toString('base64'),
      checksum,
      mimeType: 'application/pdf',
    }
  }

  private static buildPackingSlipPdf(data: {
    orderNumber: string
    channel: string
    carrier: string
    trackingNumber: string | null
    recipientName: string
    recipientPhone: string
    recipientAddress: string
    items: { sku: string; name: string; quantity: number; packedQuantity: number }[]
    binaryBars: string
    barcodeText: string
    createdAt: string
  }): string {
    const W = 595.28 // A4 Width
    const H = 841.89 // A4 Height

    const clean = (s: string) => (s || '').replace(/[\(\)\\]/g, ' ').slice(0, 60)

    // Draw barcode
    const barWidth = 1.3
    const startX = 380
    const barHeight = 35
    const barcodeY = H - 95

    let barCommands = ''
    for (let i = 0; i < data.binaryBars.length; i++) {
      if (data.binaryBars[i] === '1') {
        const x = startX + i * barWidth
        barCommands += `${x.toFixed(2)} ${barcodeY.toFixed(2)} ${barWidth.toFixed(2)} ${barHeight.toFixed(2)} re f\n`
      }
    }

    // Build item rows
    let itemRowsPdf = ''
    let curY = H - 240
    data.items.slice(0, 15).forEach((it, idx) => {
      itemRowsPdf += `
        BT
        /F1 10 Tf
        45 ${curY} Td
        (${idx + 1}) Tj
        100 ${curY} Td
        (${clean(it.sku)}) Tj
        220 ${curY} Td
        (${clean(it.name).slice(0, 32)}) Tj
        480 ${curY} Td
        (${it.quantity} Adet) Tj
        ET
        0.8 0.8 0.8 RG 0.5 w
        40 ${curY - 5} 515 0.5 re S
      `
      curY -= 24
    })

    const stream = `
      % Header Box
      0.96 0.96 0.97 rg
      35 ${H - 110} 525 75 re f
      0.8 0.8 0.8 RG 1 w
      35 ${H - 110} 525 75 re S

      % Title
      BT
      /F1 16 Tf
      50 ${H - 65} Td
      (ZUULAB E-COMMERCE - SEVK VE PAKETLEME FİŞİ) Tj
      /F1 10 Tf
      50 ${H - 85} Td
      (Kanal: ${clean(data.channel)}  |  Tarih: ${clean(data.createdAt.slice(0, 10))}) Tj
      ET

      % Barcode
      0 0 0 rg
      ${barCommands}
      BT
      /F1 8 Tf
      ${startX + 20} ${barcodeY - 10} Td
      (${clean(data.barcodeText)}) Tj
      ET

      % Recipient & Shipment Info Box
      0.98 0.98 0.99 rg
      35 ${H - 190} 525 70 re f
      0.85 0.85 0.85 RG 1 w
      35 ${H - 190} 525 70 re S

      BT
      /F1 11 Tf
      50 ${H - 140} Td
      (Siparis No: ${clean(data.orderNumber)}     Kargo: ${clean(data.carrier)}) Tj
      50 ${H - 160} Td
      (Alici: ${clean(data.recipientName)}     Iletisim: ${clean(data.recipientPhone)}) Tj
      50 ${H - 180} Td
      (Teslimat Bolgesi: ${clean(data.recipientAddress)}) Tj
      ET

      % Table Header
      0.9 0.9 0.92 rg
      35 ${H - 215} 525 20 re f
      BT
      /F1 10 Tf
      45 ${H - 203} Td
      (SIRA) Tj
      100 ${H - 203} Td
      (SKU / URUN KODU) Tj
      220 ${H - 203} Td
      (URUN ADI) Tj
      480 ${H - 203} Td
      (MIKTAR) Tj
      ET

      % Table Rows
      ${itemRowsPdf}

      % Footer note
      BT
      /F1 9 Tf
      50 60 Td
      (Bu belge ZUULAB depo lojistik operasyonlari tarafindan otomatik uretilmistir.) Tj
      50 45 Td
      (Kisisel veriler KVKK guvencesi altindadir. Yetkisiz paylasilamaz.) Tj
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
    return body + xref + trailer
  }
}
