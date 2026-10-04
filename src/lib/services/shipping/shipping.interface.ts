export type ShipmentStatus =
  | 'CREATED'
  | 'LABEL_CREATED'
  | 'READY_TO_SHIP'
  | 'SHIPPED'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'DELIVERY_FAILED'
  | 'RETURNED'
  | 'CANCELLED'

export type ShippingProviderType = 'MOCK' | 'YURTICI' | 'SURAT' | 'GELIVER'

export interface ShipmentEvent {
  id: string
  shipmentId: string
  status: ShipmentStatus
  description: string
  location?: string
  eventAt: string
  rawPayload?: Record<string, unknown>
  createdAt: string
}

export interface StoredShipment {
  id: string
  orderId: string
  orderNumber: string
  provider: string
  providerShipmentId: string
  trackingNumber: string
  trackingUrl: string
  status: ShipmentStatus
  labelData?: string // Base64 PDF / HTML / Barcode representation
  labelFormat?: 'PDF' | 'HTML' | 'ZPL'
  shippedAt?: string | null
  deliveredAt?: string | null
  cancelledAt?: string | null
  notes?: string | null
  events: ShipmentEvent[]
  createdAt: string
  updatedAt: string
}

export interface CreateShipmentInput {
  orderNumber: string
  customerName: string
  customerPhone: string
  customerEmail?: string
  /** Kapıda ödeme: the amount the carrier collects from the customer at the door */
  cashOnDeliveryAmount?: number
  shippingAddress: {
    addressLine: string
    city: string
    district: string
    postalCode: string
    country?: string
  }
  items: Array<{
    productName: string
    sku: string
    quantity: number
    weightKg?: number
  }>
  totalWeightKg?: number
  packageCount?: number
  notes?: string
}

export interface TrackingResult {
  providerShipmentId: string
  trackingNumber: string
  trackingUrl: string
  status: ShipmentStatus
  carrierStatusText?: string
  location?: string
  lastEventAt: string
  deliveredAt?: string
  events: Array<{
    status: ShipmentStatus
    description: string
    location?: string
    eventAt: string
  }>
}

export interface ShippingLabelResult {
  labelData: string
  labelFormat: 'PDF' | 'HTML' | 'ZPL'
}


export interface CreateReturnShipmentInput {
  returnNumber: string
  orderNumber: string
  customerName: string
  customerPhone: string
  pickupAddress: {
    addressLine: string
    city: string
    district: string
    postalCode: string
    country?: string
  }
  warehouseAddress?: {
    addressLine: string
    city: string
    district: string
    postalCode: string
  }
  items: Array<{
    productName: string
    sku: string
    quantity: number
  }>
  packageCount?: number
}

export interface ShippingProvider {
  readonly providerName: string
  isConfigured?(): boolean
  createShipment(input: CreateShipmentInput): Promise<{
    providerShipmentId: string
    trackingNumber: string
    trackingUrl: string
    status: ShipmentStatus
    labelData?: string
    labelFormat?: 'PDF' | 'HTML' | 'ZPL'
  }>
  createReturnShipment?(input: CreateReturnShipmentInput): Promise<{
    providerShipmentId: string
    trackingNumber: string
    trackingUrl: string
    status: ShipmentStatus
    labelData?: string
    labelFormat?: 'PDF' | 'HTML' | 'ZPL'
  }>
  getTracking(trackingNumberOrCargoKey: string): Promise<TrackingResult>
  getLabel(trackingNumberOrCargoKey: string): Promise<ShippingLabelResult>
  cancelShipment(trackingNumberOrCargoKey: string): Promise<{
    success: boolean
    message?: string
  }>
  verifyWebhookSignature?(payload: string, signature: string): boolean
}

// ─────────────────────────────────────────────────────────────
// PHASE 19: UNIVERSAL CARGO PROVIDER CONTRACT (ICargoProvider)
// ─────────────────────────────────────────────────────────────

import type {
  CarrierProviderType,
  ShippingShipmentStatus,
  CreateShipmentRequest,
  CreateShipmentResult,
  ShipmentStatusResult,
  CancelShipmentResult,
  CreateLabelRequest,
  ShippingLabelResult as UniversalShippingLabelResult,
  ShipmentTrackingResult,
  CarrierConnectionTestResult,
} from './shipping-types'

export interface ICargoProvider {
  readonly provider: CarrierProviderType
  readonly carrierName: string

  testConnection(): Promise<CarrierConnectionTestResult>

  createShipment(
    request: CreateShipmentRequest
  ): Promise<CreateShipmentResult>

  getShipment(
    trackingNumber: string
  ): Promise<ShipmentStatusResult>

  cancelShipment(
    shipmentId: string
  ): Promise<CancelShipmentResult>

  createLabel(
    request: CreateLabelRequest
  ): Promise<UniversalShippingLabelResult>

  getLabel(
    labelIdOrTracking: string
  ): Promise<UniversalShippingLabelResult>

  getTracking(
    trackingNumber: string
  ): Promise<ShipmentTrackingResult>

  normalizeStatus(rawStatus: string): ShippingShipmentStatus

  verifyWebhookSignature?(
    payload: string,
    signature: string
  ): boolean
}
