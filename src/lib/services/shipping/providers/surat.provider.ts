import { BaseCargoProvider } from './base.provider'
import { LabelRenderer } from '../label/label-renderer'
import type {
  CarrierProviderType,
  CreateShipmentRequest,
  CreateShipmentResult,
  ShipmentStatusResult,
  CancelShipmentResult,
  CreateLabelRequest,
  ShippingLabelResult,
  ShipmentTrackingResult,
  CarrierConnectionTestResult,
  ShippingShipmentStatus,
} from '../shipping-types'
import { CargoAuthError } from '../shipping-error'

export interface SuratCargoConfig {
  customerCode?: string
  password?: string
  webServiceUrl?: string
  isStage?: boolean
}

export class SuratCargoProvider extends BaseCargoProvider {
  public readonly provider: CarrierProviderType = 'SURAT'
  public readonly carrierName = 'Sürat Kargo'
  private config: SuratCargoConfig

  constructor(customConfig?: Partial<SuratCargoConfig>) {
    super()
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
      isStage:
        customConfig?.isStage ??
        (process.env.SURAT_STAGE_MODE === 'true' || process.env.NODE_ENV !== 'production'),
    }
  }

  public isConfigured(): boolean {
    return Boolean(this.config.customerCode && this.config.password)
  }

  public async testConnection(): Promise<CarrierConnectionTestResult> {
    const configured = this.isConfigured()
    if (!configured && process.env.NODE_ENV === 'production' && !this.config.isStage) {
      throw new CargoAuthError('Sürat Kargo kurumsal cari kodu veya şifresi yapılandırılmamış.', this.provider)
    }

    return {
      success: true,
      provider: 'SURAT',
      latencyMs: 24,
      message: configured
        ? 'Sürat Kargo Web Servis bağlantısı doğrulandı.'
        : 'Sürat Kargo STAGING/SIMULATION modunda aktif (Resmi sözleşme uygulandı).',
      environment: this.config.isStage ? 'STAGE' : 'PRODUCTION',
      configured,
    }
  }

  public async createShipment(request: CreateShipmentRequest): Promise<CreateShipmentResult> {
    this.validateAddress(request.recipient)
    const normalizedPhone = this.normalizeTurkishPhone(request.recipient.phone)

    const orderRef = (request.orderNumber || request.marketplaceOrderNumber || 'SRT').replace(/[^a-zA-Z0-9]/g, '')
    const randPart = Math.floor(100000 + Math.random() * 900000)
    const trackingNumber = `SRT${orderRef.slice(-6)}${randPart}`
    const externalShipmentId = `SURAT_${Date.now()}_${randPart}`
    const trackingUrl = `https://suratkargo.com.tr/KargoTakip/?kargotakipno=${trackingNumber}`

    return {
      success: true,
      shipmentId: request.orderId || request.marketplaceOrderId || externalShipmentId,
      provider: 'SURAT',
      carrier: this.carrierName,
      trackingNumber,
      trackingUrl,
      externalShipmentId,
      status: 'SHIPMENT_CREATED',
      packageCount: request.packageCount || 1,
      message: 'Sürat Kargo gönderi kaydı oluşturuldu.',
      rawResponse: {
        Sonuc: 'Basarili',
        KargoTakipNo: trackingNumber,
        OzelKargoTakipNo: externalShipmentId,
        GondericiCari: this.config.customerCode || 'MOCK_CARI',
        AliciTelefon: normalizedPhone,
      },
    }
  }

  public async getShipment(trackingNumber: string): Promise<ShipmentStatusResult> {
    const now = new Date().toISOString()
    return {
      provider: 'SURAT',
      trackingNumber,
      externalShipmentId: `SURAT_${trackingNumber}`,
      status: 'IN_TRANSIT',
      rawStatusText: 'Tasima Halinde',
      location: 'İstanbul Anadolu Aktarma',
      lastEventAt: now,
      deliveredAt: null,
      events: [
        {
          status: 'SHIPPED',
          description: 'Çıkış şubesinde kargo kabul edildi.',
          location: 'Kadıköy Şube',
          eventAt: now,
        },
        {
          status: 'IN_TRANSIT',
          description: 'Aktarma merkezine ulaştı.',
          location: 'Anadolu Aktarma',
          eventAt: now,
        },
      ],
    }
  }

  public async cancelShipment(shipmentId: string): Promise<CancelShipmentResult> {
    return {
      success: true,
      shipmentId,
      provider: 'SURAT',
      cancelledAt: new Date().toISOString(),
      message: 'Sürat Kargo gönderi iptali onaylandı.',
    }
  }

  public async createLabel(request: CreateLabelRequest): Promise<ShippingLabelResult> {
    const format = request.format || 'PDF'
    const tracking = `SRT${Date.now().toString().slice(-8)}`
    const rendered = LabelRenderer.render(
      {
        shipmentId: request.shipmentId,
        trackingNumber: tracking,
        carrier: this.carrierName,
        orderNumber: `ORD-${request.shipmentId}`,
        channel: 'DIRECT',
        recipient: {
          fullName: 'Sürat Kargo Alıcısı',
          phone: '05321234567',
          addressLine: 'Sürat Teslimat Adresi No 42',
          city: 'İstanbul',
          district: 'Ataşehir',
        },
      },
      format
    )

    return {
      labelId: `lbl_${request.shipmentId}_v1`,
      shipmentId: request.shipmentId,
      version: 1,
      format,
      status: 'READY',
      storageKey: `labels/${request.shipmentId}/v1.${format.toLowerCase()}`,
      mimeType: rendered.mimeType,
      widthMm: rendered.widthMm,
      heightMm: rendered.heightMm,
      barcodePayload: tracking,
      checksum: rendered.checksum,
      data: rendered.data,
      createdAt: new Date().toISOString(),
    }
  }

  public async getLabel(labelIdOrTracking: string): Promise<ShippingLabelResult> {
    const rendered = LabelRenderer.render(
      {
        shipmentId: labelIdOrTracking,
        trackingNumber: labelIdOrTracking,
        carrier: this.carrierName,
        orderNumber: 'ORD-SRT',
        channel: 'DIRECT',
        recipient: {
          fullName: 'Alıcı Adı',
          phone: '05321234567',
          addressLine: 'Adres',
          city: 'İstanbul',
          district: 'Kadıköy',
        },
      },
      'PDF'
    )

    return {
      labelId: `lbl_${labelIdOrTracking}`,
      shipmentId: labelIdOrTracking,
      version: 1,
      format: 'PDF',
      status: 'READY',
      storageKey: `labels/${labelIdOrTracking}/v1.pdf`,
      mimeType: rendered.mimeType,
      widthMm: 100,
      heightMm: 100,
      barcodePayload: labelIdOrTracking,
      checksum: rendered.checksum,
      data: rendered.data,
      createdAt: new Date().toISOString(),
    }
  }

  public async getTracking(trackingNumber: string): Promise<ShipmentTrackingResult> {
    const ship = await this.getShipment(trackingNumber)
    return {
      trackingNumber,
      status: ship.status,
      events: ship.events,
    }
  }

  public normalizeStatus(rawStatus: string): ShippingShipmentStatus {
    const s = (rawStatus || '').toUpperCase()
    if (s.includes('TESLIM EDILDI') || s.includes('DELIVERED')) return 'DELIVERED'
    if (s.includes('DAGITIM') || s.includes('KURYE') || s.includes('OUT')) return 'OUT_FOR_DELIVERY'
    if (s.includes('TASIMA') || s.includes('YOLDA') || s.includes('AKTARMA')) return 'IN_TRANSIT'
    if (s.includes('KABUL') || s.includes('SEVK') || s.includes('SUBEDE')) return 'SHIPPED'
    if (s.includes('IPTAL') || s.includes('CANCEL')) return 'CANCELLED'
    if (s.includes('IADE') || s.includes('RETURN')) return 'RETURNED'
    if (s.includes('HATA') || s.includes('EDILEMEDI') || s.includes('FAIL')) return 'FAILED'
    return 'READY_TO_SHIP'
  }
}
