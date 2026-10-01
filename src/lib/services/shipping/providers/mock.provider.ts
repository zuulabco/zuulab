import crypto from 'crypto'
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
import {
  CargoRateLimitError,
  CargoTimeoutError,
  CargoValidationError,
  CargoAuthError,
  CargoDuplicateError,
} from '../shipping-error'

export interface MockProviderOptions {
  failureMode?:
    | 'MOCK_RATE_LIMIT'
    | 'MOCK_PROVIDER_TIMEOUT'
    | 'MOCK_INVALID_ADDRESS'
    | 'MOCK_AUTH_FAILURE'
    | 'MOCK_DUPLICATE'
    | 'MOCK_SHIPMENT_SUCCESS'
    | 'MOCK_LABEL_SUCCESS'
    | null
  webhookSecret?: string
}

export class MockCargoProvider extends BaseCargoProvider {
  public readonly provider: CarrierProviderType = 'MOCK'
  public readonly carrierName = 'Zuulab Express (Mock Carrier)'
  private failureMode: string | null = null
  private webhookSecret: string

  constructor(options?: MockProviderOptions) {
    super()
    this.failureMode = options?.failureMode ?? null
    this.webhookSecret = options?.webhookSecret || process.env.MOCK_CARGO_WEBHOOK_SECRET || 'zuulab-mock-secret'
  }

  public setFailureMode(mode: string | null): void {
    this.failureMode = mode
  }

  public async testConnection(): Promise<CarrierConnectionTestResult> {
    if (this.failureMode === 'MOCK_AUTH_FAILURE') {
      return {
        success: false,
        provider: 'MOCK',
        latencyMs: 15,
        message: 'Mock authentication rejected (MOCK_AUTH_FAILURE active)',
        environment: 'MOCK',
        configured: true,
      }
    }

    return {
      success: true,
      provider: 'MOCK',
      latencyMs: 12,
      message: 'Mock cargo connection successful.',
      environment: 'MOCK',
      configured: true,
    }
  }

  public async createShipment(request: CreateShipmentRequest): Promise<CreateShipmentResult> {
    this.validateAddress(request.recipient)

    // Check simulated failure modes
    if (this.failureMode === 'MOCK_RATE_LIMIT') {
      throw new CargoRateLimitError('MOCK: HTTP 429 Too Many Requests', this.provider)
    }
    if (this.failureMode === 'MOCK_PROVIDER_TIMEOUT') {
      throw new CargoTimeoutError('MOCK: Request timed out after 10000ms', this.provider)
    }
    if (this.failureMode === 'MOCK_AUTH_FAILURE') {
      throw new CargoAuthError('MOCK: HTTP 401 Unauthorized API Key', this.provider)
    }
    if (this.failureMode === 'MOCK_INVALID_ADDRESS') {
      throw new CargoValidationError('MOCK: Alıcı adresi kurye dağıtım bölgesi dışındadır.', this.provider)
    }
    if (this.failureMode === 'MOCK_DUPLICATE') {
      throw new CargoDuplicateError('MOCK: Bu sipariş numarası için zaten aktif bir kargo mevcuttur.', this.provider)
    }

    const orderRef = (request.orderNumber || request.marketplaceOrderNumber || 'ORD').replace(/[^a-zA-Z0-9]/g, '')
    const randSuffix = Math.floor(100000 + Math.random() * 900000)
    const trackingNumber = `MCK${orderRef.slice(-6)}${randSuffix}`
    const externalShipmentId = `EXT_MCK_${Date.now()}_${randSuffix}`
    const trackingUrl = `https://mockcargo.zuulab.com/track?tracking=${trackingNumber}`

    return {
      success: true,
      shipmentId: request.orderId || request.marketplaceOrderId || externalShipmentId,
      provider: 'MOCK',
      carrier: this.carrierName,
      trackingNumber,
      trackingUrl,
      externalShipmentId,
      status: 'SHIPMENT_CREATED',
      packageCount: request.packageCount || 1,
      message: 'Mock shipment created successfully.',
    }
  }

  public async getShipment(trackingNumber: string): Promise<ShipmentStatusResult> {
    const now = new Date().toISOString()
    return {
      provider: 'MOCK',
      trackingNumber,
      externalShipmentId: `EXT_${trackingNumber}`,
      status: 'IN_TRANSIT',
      rawStatusText: 'Yolda / Aktarma Merkezinde',
      location: 'İstanbul Aktarma Merkezi',
      lastEventAt: now,
      deliveredAt: null,
      events: [
        {
          status: 'SHIPPED',
          description: 'Kargo şubeden teslim alındı.',
          location: 'Kadıköy Şubesi',
          eventAt: now,
        },
        {
          status: 'IN_TRANSIT',
          description: 'Transfer merkezine ulaştı.',
          location: 'İstanbul Aktarma',
          eventAt: now,
        },
      ],
    }
  }

  public async cancelShipment(shipmentId: string): Promise<CancelShipmentResult> {
    if (this.failureMode === 'MOCK_TIMEOUT') {
      throw new CargoTimeoutError('MOCK: İptal isteği zaman aşımına uğradı.', this.provider)
    }

    return {
      success: true,
      shipmentId,
      provider: 'MOCK',
      cancelledAt: new Date().toISOString(),
      message: 'Kargo gönderisi başarıyla iptal edildi.',
    }
  }

  public async createLabel(request: CreateLabelRequest): Promise<ShippingLabelResult> {
    if (this.failureMode === 'MOCK_RATE_LIMIT') {
      throw new CargoRateLimitError('MOCK: Etiket servisi rate limit', this.provider)
    }

    const format = request.format || 'PDF'
    const trackingNumber = `MCK${Date.now().toString().slice(-8)}`
    const rendered = LabelRenderer.render(
      {
        shipmentId: request.shipmentId,
        trackingNumber,
        carrier: this.carrierName,
        orderNumber: `ORD-${request.shipmentId}`,
        channel: 'DIRECT',
        recipient: {
          fullName: 'Test Alıcı',
          phone: '05551234567',
          addressLine: 'Test Mahallesi No 1',
          city: 'İstanbul',
          district: 'Kadıköy',
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
      barcodePayload: trackingNumber,
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
        orderNumber: 'ORD-TEST',
        channel: 'DIRECT',
        recipient: {
          fullName: 'Test Alıcı',
          phone: '05551234567',
          addressLine: 'Test Mah. No 1',
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
    if (s.includes('DELIVERED') || s.includes('TESLIM')) return 'DELIVERED'
    if (s.includes('OUT') || s.includes('DAGITIM')) return 'OUT_FOR_DELIVERY'
    if (s.includes('TRANSIT') || s.includes('YOLDA') || s.includes('TASIMA')) return 'IN_TRANSIT'
    if (s.includes('SHIPPED') || s.includes('KABUL') || s.includes('SEVK')) return 'SHIPPED'
    if (s.includes('CANCEL') || s.includes('IPTAL')) return 'CANCELLED'
    if (s.includes('RETURN') || s.includes('IADE')) return 'RETURNED'
    if (s.includes('FAIL') || s.includes('HATA')) return 'FAILED'
    return 'READY_TO_SHIP'
  }

  public verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!signature) return false
    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload)
      .digest('hex')
    const sigBuf = Buffer.from(signature)
    const expBuf = Buffer.from(expected)
    if (sigBuf.length !== expBuf.length) return false
    return crypto.timingSafeEqual(sigBuf, expBuf)
  }
}
