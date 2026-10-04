import 'server-only'
import type {
  CreateShipmentInput,
  ShipmentStatus,
  ShippingLabelResult,
  ShippingProvider,
  TrackingResult,
} from '../shipping.interface'
import { SITE_URL } from '@/lib/config/urls'
import { normalizeTrMobile } from '@/lib/validations/phone'
import {
  cancelGeliverShipment,
  createGeliverTransaction,
  downloadGeliverLabel,
  GeliverError,
  getGeliverConfig,
  getGeliverShipment,
  resolveGeliverLocation,
  type GeliverConfig,
  type GeliverShipment,
  type GeliverTrackingStatus,
} from './geliver.client'

/** PTT Kargo, cash on delivery. In test mode Geliver's own test carrier is used (without cash on delivery). */
export const GELIVER_COD_SERVICE = 'PTT_KAPIDA_ODEME'
const GELIVER_TEST_SERVICE = 'GELIVER_STANDART'

/** Parcel size when the admin gives none: a typical boxed lamp or toy (~2.5 desi) */
const DEFAULT_PARCEL = { length: 25, width: 20, height: 15 }

/**
 * Geliver tracking codes (docs: Kargo takip durum kodları) → our shipment status.
 * PRE_TRANSIT keeps the label state until PTT takes the parcel.
 */
export function geliverToShipmentStatus(ts: GeliverTrackingStatus | null | undefined): ShipmentStatus {
  const code = ts?.trackingStatusCode || ''
  const sub = ts?.trackingSubStatusCode || ''
  switch (code) {
    case 'TRANSIT':
      if (sub === 'out_for_delivery') return 'OUT_FOR_DELIVERY'
      if (sub === 'package_accepted') return 'SHIPPED'
      return 'IN_TRANSIT'
    case 'DELIVERED':
      return 'DELIVERED'
    case 'FAILURE':
      return 'DELIVERY_FAILED'
    case 'RETURNED':
      return 'RETURNED'
    case 'CANCELED':
      return 'CANCELLED'
    default:
      return 'LABEL_CREATED'
  }
}

function requireConfig(): GeliverConfig {
  const config = getGeliverConfig()
  if (!config) {
    throw new GeliverError('Geliver yapılandırılmamış: GELIVER_API_TOKEN ve GELIVER_SENDER_ADDRESS_ID ortam değişkenleri gerekli.')
  }
  return config
}

/** Geliver wants +90 5XX XXX XX XX as +905XXXXXXXXX */
function toE164(phone: string): string {
  const local = normalizeTrMobile(phone)
  if (!local) throw new GeliverError(`Alıcı telefonu geçersiz: "${phone}". Siparişteki telefonu kontrol edin.`)
  return `+9${local}`
}

export class GeliverShippingProvider implements ShippingProvider {
  public readonly providerName = 'GELIVER'

  isConfigured(): boolean {
    return getGeliverConfig() !== null
  }

  async createShipment(input: CreateShipmentInput) {
    const config = requireConfig()
    const location = await resolveGeliverLocation(config.token, input.shippingAddress.city, input.shippingAddress.district)
    // Geliver's test carrier has no cash-on-delivery offer ("offerId is empty"), so test
    // shipments are plain ones; live shipments are PTT kapıda ödeme
    const cod = input.cashOnDeliveryAmount !== undefined && !config.testMode
    const weightKg = Math.max(0.1, input.totalWeightKg || 1)

    const tx = await createGeliverTransaction(config.token, {
      providerServiceCode: config.testMode ? GELIVER_TEST_SERVICE : GELIVER_COD_SERVICE,
      shipment: {
        test: config.testMode,
        senderAddressID: config.senderAddressId,
        returnAddressID: config.returnAddressId,
        length: String(DEFAULT_PARCEL.length),
        width: String(DEFAULT_PARCEL.width),
        height: String(DEFAULT_PARCEL.height),
        distanceUnit: 'cm',
        weight: String(weightKg),
        massUnit: 'kg',
        items: input.items.map((i) => ({ title: i.productName.slice(0, 120), quantity: i.quantity })),
        recipientAddress: {
          name: input.customerName,
          email: input.customerEmail || 'musteri@zuulab.com',
          phone: toE164(input.customerPhone),
          address1: input.shippingAddress.addressLine.slice(0, 250),
          countryCode: 'TR',
          cityName: location.cityName,
          cityCode: location.cityCode,
          districtName: location.districtName,
          districtID: location.districtID,
          ...(input.shippingAddress.postalCode ? { zip: input.shippingAddress.postalCode } : {}),
        },
        productPaymentOnDelivery: cod,
        hidePackageContentOnTag: false,
        order: {
          sourceCode: 'API',
          sourceIdentifier: SITE_URL,
          orderNumber: input.orderNumber,
          // For cash on delivery this is what PTT collects at the door
          totalAmount: Number((input.cashOnDeliveryAmount ?? 0).toFixed(2)),
          totalAmountCurrency: 'TL',
        },
      },
    })

    const shipment = tx.shipment
    if (!shipment?.id) throw new GeliverError('Geliver gönderi kimliği dönmedi.')
    if (shipment.hasError) throw new GeliverError(`Geliver gönderiyi oluşturamadı: ${shipment.lastErrorMessage || 'bilinmeyen hata'}`)

    let labelData: string | undefined
    if (shipment.labelURL) {
      labelData = (await downloadGeliverLabel(config.token, shipment.labelURL).catch(() => null))?.toString('base64')
    }

    return {
      providerShipmentId: shipment.id,
      // PTT's tracking number appears once the parcel is handed in; the barcode is known now
      trackingNumber: shipment.trackingNumber || shipment.barcode || shipment.id,
      trackingUrl: shipment.trackingUrl || '',
      status: 'LABEL_CREATED' as ShipmentStatus,
      labelData,
      labelFormat: 'PDF' as const,
    }
  }

  async getTracking(providerShipmentId: string): Promise<TrackingResult> {
    const config = requireConfig()
    const s: GeliverShipment = await getGeliverShipment(config.token, providerShipmentId)
    const ts = s.trackingStatus
    const status = geliverToShipmentStatus(ts)
    const eventAt = ts?.statusDate || ts?.updatedAt || new Date().toISOString()
    return {
      providerShipmentId: s.id,
      trackingNumber: s.trackingNumber || s.barcode || s.id,
      trackingUrl: s.trackingUrl || '',
      status,
      carrierStatusText: ts?.statusDetails || undefined,
      location: ts?.locationName || undefined,
      lastEventAt: eventAt,
      deliveredAt: status === 'DELIVERED' ? eventAt : undefined,
      events: ts ? [{ status, description: ts.statusDetails || status, location: ts.locationName || undefined, eventAt }] : [],
    }
  }

  async getLabel(providerShipmentId: string): Promise<ShippingLabelResult> {
    const config = requireConfig()
    const s = await getGeliverShipment(config.token, providerShipmentId)
    if (!s.labelURL) throw new GeliverError('Bu gönderinin etiketi henüz hazır değil.')
    const pdf = await downloadGeliverLabel(config.token, s.labelURL)
    return { labelData: pdf.toString('base64'), labelFormat: 'PDF' }
  }

  async cancelShipment(providerShipmentId: string) {
    const config = requireConfig()
    await cancelGeliverShipment(config.token, providerShipmentId)
    return { success: true, message: 'Geliver gönderisi iptal edildi.' }
  }
}
