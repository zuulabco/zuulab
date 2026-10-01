import type {
  ShippingProvider,
  CreateShipmentInput,
  CreateReturnShipmentInput,
  TrackingResult,
  ShippingLabelResult,
  ShipmentStatus,
} from './shipping.interface'

export class MockShippingProvider implements ShippingProvider {
  public readonly providerName = 'MOCK_CARGO'

  // In-memory store for mock tracking states so mock updates persist during testing
  private static mockShipments = new Map<
    string,
    {
      providerShipmentId: string
      trackingNumber: string
      status: ShipmentStatus
      events: Array<{
        status: ShipmentStatus
        description: string
        location?: string
        eventAt: string
      }>
    }
  >()

  async createShipment(input: CreateShipmentInput): Promise<{
    providerShipmentId: string
    trackingNumber: string
    trackingUrl: string
    status: ShipmentStatus
    labelData: string
    labelFormat: 'PDF'
  }> {
    const rawNumber = input.orderNumber.replace(/[^0-9]/g, '') || String(Date.now()).slice(-6)
    const trackingNumber = `MC${rawNumber}TR`
    const providerShipmentId = `MOCK-SHP-${Date.now()}`
    const trackingUrl = `https://kargo.zuulab.com/takip?no=${trackingNumber}`

    const initialEvents = [
      {
        status: 'LABEL_CREATED' as ShipmentStatus,
        description: 'Kargo barkodu ve gönderi kaydı oluşturuldu.',
        location: 'ZUULAB Atölye / İstanbul',
        eventAt: new Date().toISOString(),
      },
    ]

    MockShippingProvider.mockShipments.set(trackingNumber, {
      providerShipmentId,
      trackingNumber,
      status: 'LABEL_CREATED',
      events: initialEvents,
    })

    const labelPdf = this.generateSampleLabel(input.orderNumber, trackingNumber, input.customerName)

    return {
      providerShipmentId,
      trackingNumber,
      trackingUrl,
      status: 'LABEL_CREATED',
      labelData: labelPdf,
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
    const cleanNumber = input.returnNumber.replace(/[^0-9]/g, '') || String(Date.now()).slice(-8)
    const trackingNumber = `MOCK-RET-${cleanNumber}`
    const providerShipmentId = `mock_ret_${Date.now()}`
    const trackingUrl = `https://kargo.zuulab.com/iade-takip?no=${trackingNumber}`

    const labelPdf = this.generateSampleLabel(
      input.returnNumber,
      trackingNumber,
      'ZUULAB İADE MERKEZİ'
    )

    MockShippingProvider.mockShipments.set(trackingNumber, {
      providerShipmentId,
      trackingNumber,
      status: 'LABEL_CREATED',
      events: [
        {
          status: 'LABEL_CREATED',
          description: 'İade kargo barkodu oluşturuldu.',
          location: 'Müşteri Adresi',
          eventAt: new Date().toISOString(),
        },
      ],
    })

    return {
      providerShipmentId,
      trackingNumber,
      trackingUrl,
      status: 'LABEL_CREATED',
      labelData: labelPdf,
      labelFormat: 'PDF',
    }
  }

  async getTracking(trackingNumberOrCargoKey: string): Promise<TrackingResult> {
    const shipment = MockShippingProvider.mockShipments.get(trackingNumberOrCargoKey)

    if (shipment) {
      return {
        providerShipmentId: shipment.providerShipmentId,
        trackingNumber: shipment.trackingNumber,
        trackingUrl: `https://kargo.zuulab.com/takip?no=${shipment.trackingNumber}`,
        status: shipment.status,
        carrierStatusText: this.getStatusText(shipment.status),
        location: shipment.events[shipment.events.length - 1]?.location || 'İstanbul Transfer',
        lastEventAt: shipment.events[shipment.events.length - 1]?.eventAt || new Date().toISOString(),
        deliveredAt: shipment.status === 'DELIVERED' ? new Date().toISOString() : undefined,
        events: shipment.events,
      }
    }

    // Default fallback mock tracking result if not in local map
    return {
      providerShipmentId: `MOCK-${trackingNumberOrCargoKey}`,
      trackingNumber: trackingNumberOrCargoKey,
      trackingUrl: `https://kargo.zuulab.com/takip?no=${trackingNumberOrCargoKey}`,
      status: 'IN_TRANSIT',
      carrierStatusText: 'Transfer Merkezinde İşlem Görüyor',
      location: 'İstanbul Transfer Merkezi',
      lastEventAt: new Date().toISOString(),
      events: [
        {
          status: 'LABEL_CREATED',
          description: 'Kargo barkodu oluşturuldu.',
          location: 'ZUULAB Atölye',
          eventAt: new Date(Date.now() - 3600000 * 24).toISOString(),
        },
        {
          status: 'SHIPPED',
          description: 'Kurye paketi teslim aldı.',
          location: 'Kadıköy Şube',
          eventAt: new Date(Date.now() - 3600000 * 12).toISOString(),
        },
        {
          status: 'IN_TRANSIT',
          description: 'Ana transfer merkezine sevk edildi.',
          location: 'İstanbul Transfer Merkezi',
          eventAt: new Date().toISOString(),
        },
      ],
    }
  }

  async getLabel(trackingNumberOrCargoKey: string): Promise<ShippingLabelResult> {
    const pdfData = this.generateSampleLabel('ORD-REF', trackingNumberOrCargoKey, 'ZUULAB ALICI')
    return {
      labelData: pdfData,
      labelFormat: 'PDF',
    }
  }

  async cancelShipment(trackingNumberOrCargoKey: string): Promise<{
    success: boolean
    message?: string
  }> {
    const existing = MockShippingProvider.mockShipments.get(trackingNumberOrCargoKey)
    if (existing) {
      existing.status = 'CANCELLED'
      existing.events.push({
        status: 'CANCELLED',
        description: 'Gönderi firma talebiyle iptal edildi.',
        location: 'Sistem',
        eventAt: new Date().toISOString(),
      })
    }
    return {
      success: true,
      message: 'Kargo gönderisi başarıyla iptal edildi.',
    }
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!signature) return false
    return signature === 'mock_valid_signature' || signature.startsWith('mock_')
  }

  /**
   * Helper to manually advance mock status for testing purposes
   */
  public advanceMockStatus(
    trackingNumber: string,
    newStatus: ShipmentStatus,
    description: string,
    location = 'İstanbul Dağıtım Merkezi'
  ): void {
    const shipment = MockShippingProvider.mockShipments.get(trackingNumber)
    if (shipment) {
      shipment.status = newStatus
      shipment.events.push({
        status: newStatus,
        description,
        location,
        eventAt: new Date().toISOString(),
      })
    }
  }

  private getStatusText(status: ShipmentStatus): string {
    switch (status) {
      case 'CREATED':
      case 'LABEL_CREATED':
        return 'Kargo Kaydı Oluşturuldu'
      case 'READY_TO_SHIP':
        return 'Kargoya Teslim Edilmeye Hazır'
      case 'SHIPPED':
        return 'Kargo Firmasına Teslim Edildi'
      case 'IN_TRANSIT':
        return 'Yolda / Transfer Merkezinde'
      case 'OUT_FOR_DELIVERY':
        return 'Dağıtıma Çıktı'
      case 'DELIVERED':
        return 'Teslim Edildi'
      case 'DELIVERY_FAILED':
        return 'Teslimat Başarısız'
      case 'RETURNED':
        return 'İade Edildi'
      case 'CANCELLED':
        return 'İptal Edildi'
      default:
        return 'İşlem Görüyor'
    }
  }

  private generateSampleLabel(orderNumber: string, trackingNumber: string, recipientName: string): string {
    const labelText = `ZUULAB SHIPPING LABEL\nORDER: ${orderNumber}\nTRACKING: ${trackingNumber}\nRECIPIENT: ${recipientName}\nCARRIER: MOCK CARGO\nBARCODE: *${trackingNumber}*`
    const dummyPdf = `%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 283 420] /Contents 4 0 R >> endobj\n4 0 obj << /Length ${labelText.length + 50} >> stream\nBT /F1 12 Tf 20 380 Td (${labelText.replace(/\n/g, ') Tj T* (')}) Tj ET\nendstream endobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000214 00000 n \ntrailer << /Size 5 /Root 1 0 R >>\nstartxref\n350\n%%EOF`
    return Buffer.from(dummyPdf).toString('base64')
  }
}
