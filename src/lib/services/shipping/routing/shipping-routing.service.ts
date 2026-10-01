import type { CarrierProviderType, CreateShipmentRequest } from '../shipping-types'

export interface RoutingDecision {
  selectedProvider: CarrierProviderType
  carrierName: string
  reason: string
}

export class ShippingRoutingService {
  /**
   * Deterministically selects the optimal cargo provider based on order attributes and priority:
   * Priority 1: Explicit shipment/carrier requested by caller
   * Priority 2: Marketplace-required carrier (from marketplace order payload)
   * Priority 3: Payment method rules (PayTR/card -> Sürat, COD -> PTT)
   * Priority 4: Global fallback rule (Sürat)
   */
  public static selectCarrier(request: CreateShipmentRequest): RoutingDecision {
    // 1. Explicit requested carrier
    if (request.preferredProvider) {
      const p = request.preferredProvider.toUpperCase() as CarrierProviderType
      return {
        selectedProvider: p,
        carrierName: this.getCarrierDisplayName(p),
        reason: `Explicitly requested by shipment parameters: '${p}'`,
      }
    }

    // 2. Marketplace-required carrier
    if (request.channel === 'MARKETPLACE') {
      const rawNotes = (request.notes || '').toUpperCase()
      if (rawNotes.includes('PTT')) {
        return {
          selectedProvider: 'PTT',
          carrierName: 'PTT Kargo',
          reason: 'Marketplace order specified PTT Kargo agreement',
        }
      }
      if (rawNotes.includes('SURAT') || rawNotes.includes('SÜRAT')) {
        return {
          selectedProvider: 'SURAT',
          carrierName: 'Sürat Kargo',
          reason: 'Marketplace order specified Sürat Kargo agreement',
        }
      }
    }

    // 3. Payment method routing
    const payment = (request.paymentMethod || '').toUpperCase()
    if (payment === 'COD' || payment === 'KAPIDA_ODEME' || (request.codAmount && request.codAmount > 0)) {
      return {
        selectedProvider: 'PTT',
        carrierName: 'PTT Kargo',
        reason: 'Payment method is Cash-on-Delivery (Kapıda Ödeme) routed to PTT Kargo',
      }
    }

    if (payment.includes('PAYTR') || payment.includes('CARD') || payment.includes('CREDIT') || payment.includes('DIRECT')) {
      return {
        selectedProvider: 'SURAT',
        carrierName: 'Sürat Kargo',
        reason: 'Payment method is PayTR direct card payment routed to Sürat Kargo',
      }
    }

    // 4. Global default fallback
    const defaultCarrier = (process.env.DEFAULT_CARRIER || 'SURAT').toUpperCase() as CarrierProviderType
    return {
      selectedProvider: defaultCarrier,
      carrierName: this.getCarrierDisplayName(defaultCarrier),
      reason: 'Global default routing fallback rule',
    }
  }

  private static getCarrierDisplayName(provider: CarrierProviderType): string {
    switch (provider) {
      case 'SURAT':
        return 'Sürat Kargo'
      case 'PTT':
        return 'PTT Kargo'
      case 'MOCK':
        return 'Zuulab Express (Mock Carrier)'
      case 'YURTICI':
        return 'Yurtiçi Kargo'
      default:
        return String(provider)
    }
  }
}
