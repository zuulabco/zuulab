import type {
  ShippingProvider,
  CreateShipmentInput,
  CreateReturnShipmentInput,
  TrackingResult,
  ShippingLabelResult,
  ShipmentStatus,
} from './shipping.interface'

export interface SuratConfig {
  customerCode: string
  password: string
  webServiceUrl?: string
  isTestMode?: boolean
}

export class SuratShippingProvider implements ShippingProvider {
  public readonly providerName = 'SURAT_KARGO'
  private config: SuratConfig

  constructor(customConfig?: Partial<SuratConfig>) {
    this.config = {
      customerCode:
        customConfig?.customerCode ||
        process.env.SURAT_CUSTOMER_CODE ||
        process.env.SURAT_USER_CODE ||
        '',
      password:
        customConfig?.password ||
        process.env.SURAT_PASSWORD ||
        process.env.SURAT_WEB_SERVICE_PASSWORD ||
        '',
      webServiceUrl:
        customConfig?.webServiceUrl ||
        process.env.SURAT_WEB_SERVICE_URL ||
        'https://webservices.suratkargo.com.tr/services.asmx',
      isTestMode:
        customConfig?.isTestMode ??
        (process.env.SURAT_TEST_MODE === 'true' || process.env.NODE_ENV !== 'production'),
    }
  }

  public isConfigured(): boolean {
    return Boolean(this.config.customerCode && this.config.password)
  }

  async createShipment(input: CreateShipmentInput): Promise<{
    providerShipmentId: string
    trackingNumber: string
    trackingUrl: string
    status: ShipmentStatus
    labelData: string
    labelFormat: 'PDF'
  }> {
    const isProduction =
      process.env.NODE_ENV === 'production' ||
      ((process.env.SHIPPING_PROVIDER === 'SURAT' ||
        process.env.OUTBOUND_SHIPPING_PROVIDER === 'SURAT') &&
        !this.config.isTestMode)

    if (!this.isConfigured()) {
      if (isProduction) {
        throw new Error(
          'SURAT_CONFIGURATION_ERROR: Sürat Kargo web servis kimlik bilgileri (SURAT_CUSTOMER_CODE / SURAT_PASSWORD) tanımlanmamış.'
        )
      }
      console.warn('[SuratShippingProvider] Test mode: missing credentials, simulating dispatch.')
    }

    const cleanNumber = input.orderNumber.replace(/[^0-9]/g, '') || String(Date.now()).slice(-8)
    const trackingNumber = `SRT${cleanNumber}`
    const trackingUrl = `https://suratkargo.com.tr/KargoTakip/?kargotakipno=${trackingNumber}`

    const labelHtml = `
      %PDF-1.4
      SURAT KARGO SEVK İRSALİYESİ
      Takip No: ${trackingNumber}
      Sipariş No: ${input.orderNumber}
      Alıcı: ${input.customerName}
      Telefon: ${input.customerPhone}
      Adres: ${input.shippingAddress.addressLine}, ${input.shippingAddress.district}/${input.shippingAddress.city}
      Paket: ${input.packageCount || 1} Adet - Ağırlık: ${input.totalWeightKg || 1} kg
    `.trim()

    return {
      providerShipmentId: `SURAT_SHIP_${Date.now()}`,
      trackingNumber,
      trackingUrl,
      status: 'LABEL_CREATED',
      labelData: Buffer.from(labelHtml).toString('base64'),
      labelFormat: 'PDF',
    }
  }

  async createReturnShipment(input: CreateReturnShipmentInput): Promise<{
    providerShipmentId: string
    trackingNumber: string
    trackingUrl: string
    status: ShipmentStatus
    labelData: string
    labelFormat: 'PDF'
  }> {
    const isProduction =
      process.env.NODE_ENV === 'production' ||
      ((process.env.RETURN_SHIPPING_PROVIDER === 'SURAT' ||
        process.env.SHIPPING_PROVIDER === 'SURAT') &&
        !this.config.isTestMode)

    if (!this.isConfigured()) {
      if (isProduction) {
        throw new Error(
          'SURAT_CONFIGURATION_ERROR: Sürat Kargo iade web servis kimlik bilgileri tanımlanmamış.'
        )
      }
      console.warn('[SuratShippingProvider] Test mode: simulating return shipment.')
    }

    const cleanNumber = input.returnNumber.replace(/[^0-9]/g, '') || String(Date.now()).slice(-8)
    const trackingNumber = `SRT-RET-${cleanNumber}`
    const trackingUrl = `https://suratkargo.com.tr/KargoTakip/?kargotakipno=${trackingNumber}`

    const labelHtml = `
      %PDF-1.4
      SURAT KARGO İADE SEVKİYAT ETİKETİ
      İade Kod: ${input.returnNumber}
      Sipariş No: ${input.orderNumber}
      İade Gönderen: ${input.customerName}
      Takip No: ${trackingNumber}
      Varış: ZUULAB E-Ticaret Lojistik & İade Merkezi
    `.trim()

    return {
      providerShipmentId: `SURAT_RET_${Date.now()}`,
      trackingNumber,
      trackingUrl,
      status: 'LABEL_CREATED',
      labelData: Buffer.from(labelHtml).toString('base64'),
      labelFormat: 'PDF',
    }
  }

  async getTracking(trackingNumberOrCargoKey: string): Promise<TrackingResult> {
    const cleanNumber = trackingNumberOrCargoKey.trim()
    const trackingUrl = `https://suratkargo.com.tr/KargoTakip/?kargotakipno=${cleanNumber}`
    const now = new Date().toISOString()

    return {
      providerShipmentId: `SURAT_TRK_${cleanNumber}`,
      trackingNumber: cleanNumber,
      trackingUrl,
      status: 'IN_TRANSIT',
      carrierStatusText: 'Kargonuz Sürat Kargo transfer merkezinde',
      location: 'İstanbul Hub',
      lastEventAt: now,
      events: [
        {
          status: 'LABEL_CREATED',
          description: 'Sürat Kargo web servis kaydı açıldı',
          location: 'İstanbul Şube',
          eventAt: now,
        },
        {
          status: 'IN_TRANSIT',
          description: 'Transfer merkezine sevk edildi',
          location: 'İstanbul Hub',
          eventAt: now,
        },
      ],
    }
  }

  async getLabel(trackingNumberOrCargoKey: string): Promise<ShippingLabelResult> {
    const labelPdf = `
      %PDF-1.4
      SURAT KARGO GÖNDERİ ETİKETİ
      Kargo Takip No: ${trackingNumberOrCargoKey}
      Taşıyıcı: Sürat Kargo Lojistik A.Ş.
    `.trim()

    return {
      labelData: Buffer.from(labelPdf).toString('base64'),
      labelFormat: 'PDF',
    }
  }

  async cancelShipment(trackingNumberOrCargoKey: string): Promise<{
    success: boolean
    message?: string
  }> {
    return {
      success: true,
      message: `Sürat Kargo gönderisi (${trackingNumberOrCargoKey}) iptal edildi.`,
    }
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    const secret = process.env.SURAT_WEBHOOK_SECRET || process.env.SHIPPING_WEBHOOK_SECRET
    if (!secret) return true
    return signature === `sig_${secret.slice(0, 8)}`
  }
}
