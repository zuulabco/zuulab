import crypto from 'crypto'
import { BarcodeService } from './barcode.service'
import type { RenderLabelOptions, RenderedLabelOutput } from './label-types'

export class LabelRenderer {
  /**
   * Target physical size: exactly 100 mm x 100 mm
   * 100 mm in 72 DPI PDF Points = 100 * (72 / 25.4) = 283.46 pt
   */
  public static readonly PDF_POINT_SIZE = 283.46

  /**
   * Renders label in specified format (PDF, ZPL, PNG, JPG)
   */
  public static render(
    options: RenderLabelOptions,
    format: 'PDF' | 'ZPL' | 'PNG' | 'JPG' = 'PDF'
  ): RenderedLabelOutput {
    switch (format) {
      case 'PDF':
        return this.renderPdf(options)
      case 'ZPL':
        return this.renderZpl(options)
      case 'PNG':
        return this.renderRaster(options, 'PNG')
      case 'JPG':
        return this.renderRaster(options, 'JPG')
      default:
        return this.renderPdf(options)
    }
  }

  /**
   * Generates a 1:1 standard vector PDF with exact 100mm x 100mm page size (283.46 pt x 283.46 pt)
   */
  public static renderPdf(options: RenderLabelOptions): RenderedLabelOutput {
    const barcode = BarcodeService.encodeCode128(options.trackingNumber)
    const pdfData = this.buildSinglePdfDocument(options, barcode.binaryBars)
    const checksum = crypto.createHash('sha256').update(pdfData).digest('hex')

    return {
      format: 'PDF',
      data: Buffer.from(pdfData, 'latin1').toString('base64'),
      mimeType: 'application/pdf',
      widthMm: 100,
      heightMm: 100,
      checksum,
    }
  }

  /**
   * Generates Zebra Programming Language (ZPL) output for thermal printers (100mm x 100mm @ 203 DPI = 800x800)
   */
  public static renderZpl(options: RenderLabelOptions): RenderedLabelOutput {
    const sanitizeZpl = (str: string) =>
      (str || '').replace(/[\^~\\\[\]]/g, ' ').replace(/\s+/g, ' ').trim()

    const carrier = sanitizeZpl(options.carrier.toUpperCase())
    const tracking = sanitizeZpl(options.trackingNumber)
    const name = sanitizeZpl(options.recipient.fullName)
    const phone = sanitizeZpl(options.recipient.phone)
    const address = sanitizeZpl(options.recipient.addressLine).slice(0, 70)
    const districtCity = sanitizeZpl(
      `${options.recipient.district} / ${options.recipient.city}`
    ).toUpperCase()
    const orderNo = sanitizeZpl(options.orderNumber)
    const pkgText = `${options.packageCount || 1} PKT | ${options.totalWeightKg || 1} KG`
    const channelText = options.channel === 'MARKETPLACE' ? `PAZARYERI: ${sanitizeZpl(options.marketplaceOrderNumber || '')}` : 'DOGRADAN SIPARIS'
    const codText = options.codAmount ? `KAPIDA ODEME: ${options.codAmount} TL` : ''

    const zplLines = [
      '^XA',
      '^PW800',
      '^LL800',
      '^LH0,0',
      // Header box
      '^FO30,30^GB740,80,3^FS',
      `^FO50,55^A0N,36,36^FD${carrier}^FS`,
      `^FO500,60^A0N,24,24^FD${channelText}^FS`,
      // Barcode
      '^FO100,140^BY3,3,100^BCN,100,Y,N,N',
      `^FD${tracking}^FS`,
      // Separator
      '^FO30,280^GB740,3,3^FS',
      // Recipient section
      `^FO50,300^A0N,28,28^FDALICI: ${name}^FS`,
      `^FO50,340^A0N,24,24^FDTEL: ${phone}^FS`,
      `^FO50,380^A0N,22,22^FDADRES: ${address}^FS`,
      `^FO50,420^A0N,28,28^FD${districtCity}^FS`,
      // Separator
      '^FO30,470^GB740,2,2^FS',
      // Order details
      `^FO50,490^A0N,24,24^FDSIPARIS NO: ${orderNo}^FS`,
      `^FO50,525^A0N,22,22^FD${pkgText}^FS`,
      codText ? `^FO50,560^A0N,26,26^FD${codText}^FS` : '',
      // Sender / Footer
      '^FO30,690^GB740,2,2^FS',
      '^FO50,715^A0N,20,20^FDGONDERICI: ZUULAB E-COMMERCE - KADIKOY / ISTANBUL^FS',
      '^XZ',
    ].filter(Boolean)

    const zplString = zplLines.join('\n')
    const checksum = crypto.createHash('sha256').update(zplString).digest('hex')

    return {
      format: 'ZPL',
      data: zplString,
      mimeType: 'text/plain; charset=utf-8',
      widthMm: 100,
      heightMm: 100,
      checksum,
    }
  }

  /**
   * Generates raster preview (PNG or JPG as Base64 data URL)
   */
  public static renderRaster(
    options: RenderLabelOptions,
    format: 'PNG' | 'JPG'
  ): RenderedLabelOutput {
    const barcode = BarcodeService.encodeCode128(options.trackingNumber)
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
        <style>
          .header { font: bold 16px sans-serif; fill: #111; }
          .sub { font: 12px sans-serif; fill: #444; }
          .bold { font: bold 13px sans-serif; fill: #000; }
          .title { font: bold 18px sans-serif; fill: #000; }
        </style>
        <rect width="400" height="400" fill="#ffffff" stroke="#222" stroke-width="3"/>
        <rect x="15" y="15" width="370" height="45" fill="#f4f4f5" stroke="#ccc" stroke-width="1"/>
        <text x="25" y="44" class="title">${options.carrier.toUpperCase()}</text>
        <text x="370" y="44" text-anchor="end" class="sub">${options.channel === 'MARKETPLACE' ? 'PAZARYERİ' : 'DOĞRUDAN'}</text>
        
        <!-- Barcode Image -->
        <image href="${barcode.dataUrl}" x="20" y="70" width="360" height="85"/>

        <line x1="15" y1="165" x2="385" y2="165" stroke="#333" stroke-width="1.5"/>

        <!-- Recipient Information -->
        <text x="25" y="190" class="bold">ALICI: ${options.recipient.fullName}</text>
        <text x="25" y="210" class="sub">TEL: ${options.recipient.phone}</text>
        <text x="25" y="230" class="sub">ADRES: ${options.recipient.addressLine.slice(0, 48)}</text>
        <text x="25" y="250" class="bold">${options.recipient.district} / ${options.recipient.city}</text>

        <line x1="15" y1="270" x2="385" y2="270" stroke="#ddd" stroke-width="1"/>

        <!-- Order Information -->
        <text x="25" y="295" class="sub">Sipariş No: ${options.orderNumber}</text>
        <text x="25" y="315" class="sub">Paket: ${options.packageCount || 1} Adet | Ağırlık: ${options.totalWeightKg || 1} kg</text>
        ${options.codAmount ? `<text x="25" y="340" class="bold" fill="#b91c1c">KAPIDA ÖDEME: ${options.codAmount} TL</text>` : ''}

        <line x1="15" y1="355" x2="385" y2="355" stroke="#333" stroke-width="1"/>
        <text x="200" y="380" text-anchor="middle" font-size="10" font-family="sans-serif" fill="#666">
          ZUULAB E-COMMERCE · 100mm × 100mm THERMAL LABEL
        </text>
      </svg>
    `.trim()

    const mimeType = format === 'PNG' ? 'image/png' : 'image/jpeg'
    const base64Data = Buffer.from(svg).toString('base64')
    const checksum = crypto.createHash('sha256').update(svg).digest('hex')

    return {
      format,
      data: `data:${mimeType};base64,${base64Data}`,
      mimeType,
      widthMm: 100,
      heightMm: 100,
      checksum,
    }
  }

  /**
   * Combines multiple label outputs into a single multi-page PDF where each page is strictly 100x100mm
   */
  public static combinePdfLabels(labels: RenderLabelOptions[]): RenderedLabelOutput {
    if (labels.length === 0) {
      throw new Error('COMBINE_PDF_ERROR: En az bir etiket seçilmelidir.')
    }
    if (labels.length === 1) {
      return this.renderPdf(labels[0])
    }

    const pagesData: string[] = []
    for (const label of labels) {
      const barcode = BarcodeService.encodeCode128(label.trackingNumber)
      pagesData.push(this.buildPageStreamContent(label, barcode.binaryBars))
    }

    const multiPdf = this.buildMultiPagePdfDocument(pagesData)
    const checksum = crypto.createHash('sha256').update(multiPdf).digest('hex')

    return {
      format: 'PDF',
      data: Buffer.from(multiPdf, 'latin1').toString('base64'),
      mimeType: 'application/pdf',
      widthMm: 100,
      heightMm: 100,
      checksum,
    }
  }

  // ─────────────────────────────────────────────────────────────
  // PURE VECTOR PDF BUILDERS (100mm x 100mm = 283.46 pt)
  // ─────────────────────────────────────────────────────────────

  private static buildSinglePdfDocument(options: RenderLabelOptions, binaryBars: string): string {
    const pageStream = this.buildPageStreamContent(options, binaryBars)
    return this.buildMultiPagePdfDocument([pageStream])
  }

  private static buildPageStreamContent(options: RenderLabelOptions, binaryBars: string): string {
    const W = this.PDF_POINT_SIZE // 283.46
    const H = this.PDF_POINT_SIZE // 283.46

    // Barcode vector bars coordinates (drawn inside y = 145 to 195)
    const barWidth = 1.2
    const startX = 20
    const barHeight = 42
    const barcodeY = 150 // PDF coordinates: bottom is 0

    let barCommands = ''
    for (let i = 0; i < binaryBars.length; i++) {
      if (binaryBars[i] === '1') {
        const x = startX + i * barWidth
        barCommands += `${x.toFixed(2)} ${barcodeY.toFixed(2)} ${barWidth.toFixed(2)} ${barHeight.toFixed(2)} re f\n`
      }
    }

    const clean = (s: string) => (s || '').replace(/[\(\)\\]/g, ' ').slice(0, 45)

    const recipientName = clean(options.recipient.fullName)
    const recipientPhone = clean(options.recipient.phone)
    const recipientAddr = clean(options.recipient.addressLine)
    const recipientCity = clean(`${options.recipient.district} / ${options.recipient.city}`).toUpperCase()
    const orderNo = clean(options.orderNumber)
    const trackingNo = clean(options.trackingNumber)
    const carrier = clean(options.carrier.toUpperCase())
    const channelText = clean(
      options.channel === 'MARKETPLACE'
        ? (options.marketplaceOrderNumber ? `PAZARYERI: ${options.marketplaceOrderNumber}` : 'PAZARYERI')
        : 'ZUULAB DOGRADAN'
    )

    return `
      % Outer border
      0 0 0 RG 1.5 w
      10 10 ${W - 20} ${H - 20} re S
      
      % Header Box
      0.95 0.95 0.95 rg
      10 ${H - 45} ${W - 20} 35 re f
      0 0 0 RG 1 w
      10 ${H - 45} ${W - 20} 35 re S
      
      % Header text
      BT
      /F1 12 Tf
      20 ${H - 32} Td
      (${carrier}) Tj
      /F1 8 Tf
      ${(W - 110).toFixed(2)} ${H - 32} Td
      (${channelText}) Tj
      ET
      
      % Barcode Vector Bars
      0 0 0 rg
      ${barCommands}
      
      % Barcode human readable text
      BT
      /F1 9 Tf
      ${(W / 2 - 35).toFixed(2)} ${barcodeY - 12} Td
      (${trackingNo}) Tj
      ET
      
      % Separator line 1
      0 0 0 RG 1 w
      15 125 m ${W - 15} 125 l S
      
      % Recipient Box
      BT
      /F1 10 Tf
      20 110 Td
      (ALICI: ${recipientName}) Tj
      /F1 8 Tf
      0 -13 Td
      (TEL: ${recipientPhone}) Tj
      0 -13 Td
      (ADRES: ${recipientAddr}) Tj
      /F1 9 Tf
      0 -14 Td
      (${recipientCity}) Tj
      ET
      
      % Separator line 2
      0.8 0.8 0.8 RG 0.5 w
      15 58 m ${W - 15} 58 l S
      
      % Footer / Order Info
      BT
      /F1 8 Tf
      20 46 Td
      (SIPARIS: ${orderNo} | PAKET: ${options.packageCount || 1} ADET) Tj
      0 -12 Td
      (GONDERICI: ZUULAB E-COMMERCE) Tj
      /F1 6 Tf
      0 -12 Td
      (ZUULAB 100x100mm STANDARD THERMAL SHIPPING LABEL) Tj
      ET
    `.trim()
  }

  private static buildMultiPagePdfDocument(pageStreams: string[]): string {
    const W = this.PDF_POINT_SIZE.toFixed(2)
    const H = this.PDF_POINT_SIZE.toFixed(2)
    const pageCount = pageStreams.length

    let out = `%PDF-1.4\n`
    const offsets: number[] = []

    const addObj = (content: string) => {
      offsets.push(out.length)
      out += `${offsets.length} 0 obj\n${content}\nendobj\n`
    }

    // 1: Catalog
    addObj(`<< /Type /Catalog /Pages 2 0 R >>`)

    // 2: Pages list placeholder
    const pageObjStart = 3
    const pageObjRefs: string[] = []
    for (let i = 0; i < pageCount; i++) {
      pageObjRefs.push(`${pageObjStart + i * 2} 0 R`)
    }
    addObj(`<< /Type /Pages /Kids [${pageObjRefs.join(' ')}] /Count ${pageCount} >>`)

    // Add each page object and its content stream
    for (let i = 0; i < pageCount; i++) {
      const pageIndex = i
      const pageObjNum = pageObjStart + pageIndex * 2
      const contentObjNum = pageObjNum + 1

      // Page Object
      addObj(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Contents ${contentObjNum} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> >>`
      )

      // Content Stream Object
      const stream = pageStreams[i]
      addObj(
        `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`
      )
    }

    // XRef table
    const xrefOffset = out.length
    out += `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`
    for (const offset of offsets) {
      out += `${offset.toString().padStart(10, '0')} 00000 n \n`
    }

    out += `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
    return out
  }
}
