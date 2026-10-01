export type ShippingShipmentStatus =
  | 'PENDING'
  | 'READY_TO_SHIP'
  | 'SHIPMENT_CREATING'
  | 'SHIPMENT_CREATED'
  | 'LABEL_REQUESTED'
  | 'LABEL_READY'
  | 'SHIPPED'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'RETURN_REQUESTED'
  | 'RETURNED'
  | 'CANCELLED'
  | 'FAILED'

export type ShippingLabelFormat = 'PDF' | 'ZPL' | 'PNG' | 'JPG'

export type ShippingLabelStatus = 'GENERATING' | 'READY' | 'FAILED' | 'SUPERSEDED'

export type ShippingQueueJobType =
  | 'CREATE_SHIPMENT'
  | 'CREATE_LABEL'
  | 'POLL_LABEL'
  | 'UPDATE_TRACKING'
  | 'UPDATE_MARKETPLACE'
  | 'CANCEL_SHIPMENT'

export type ShippingQueueStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'RETRYING'
  | 'CANCELLED'

export type CarrierProviderType = 'SURAT' | 'PTT' | 'MOCK' | 'YURTICI'

export interface ShippingAddressInput {
  fullName: string
  phone: string
  addressLine: string
  addressLine2?: string | null
  city: string
  district: string
  postalCode?: string | null
  country?: string
}

export interface ShippingItemInput {
  productName: string
  sku: string
  quantity: number
  unitPrice?: number
  weightKg?: number
}

export interface CreateShipmentRequest {
  orderId?: string | null
  orderNumber?: string | null
  marketplaceOrderId?: string | null
  marketplaceOrderNumber?: string | null
  channel: 'DIRECT' | 'MARKETPLACE'
  storeId?: string | null
  preferredProvider?: CarrierProviderType
  serviceType?: string
  recipient: ShippingAddressInput
  items: ShippingItemInput[]
  packageCount?: number
  totalWeightKg?: number
  paymentMethod?: string | null
  codAmount?: number | null
  notes?: string | null
  idempotencyKey?: string
}

export interface CreateShipmentResult {
  success: boolean
  shipmentId: string
  provider: CarrierProviderType
  carrier: string
  trackingNumber: string
  trackingUrl: string
  externalShipmentId: string
  status: ShippingShipmentStatus
  packageCount: number
  isAsync?: boolean
  message?: string
  rawResponse?: unknown
}

export interface ShipmentStatusResult {
  provider: CarrierProviderType
  trackingNumber: string
  externalShipmentId?: string
  status: ShippingShipmentStatus
  rawStatusText?: string
  location?: string
  lastEventAt: string
  deliveredAt?: string | null
  events: Array<{
    status: ShippingShipmentStatus
    description: string
    location?: string
    eventAt: string
    rawPayload?: unknown
  }>
}

export interface CancelShipmentResult {
  success: boolean
  shipmentId: string
  provider: CarrierProviderType
  cancelledAt: string
  message: string
}

export interface CreateLabelRequest {
  shipmentId: string
  format?: ShippingLabelFormat
  regenerate?: boolean
}

export interface ShippingLabelResult {
  labelId: string
  shipmentId: string
  version: number
  format: ShippingLabelFormat
  status: ShippingLabelStatus
  storageKey: string
  mimeType: string
  widthMm: number
  heightMm: number
  barcodePayload: string
  checksum: string
  data: string // Base64 data or ZPL payload
  createdAt: string
}

export interface ShipmentTrackingResult {
  trackingNumber: string
  status: ShippingShipmentStatus
  events: Array<{
    status: ShippingShipmentStatus
    description: string
    location?: string
    eventAt: string
  }>
}

export interface ShippingShipmentRecord {
  id: string
  orderId: string | null
  orderNumber: string | null
  marketplaceOrderId: string | null
  marketplaceOrderNumber: string | null
  channel: 'DIRECT' | 'MARKETPLACE'
  storeId: string | null
  provider: CarrierProviderType
  carrier: string
  externalShipmentId: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  status: ShippingShipmentStatus
  serviceType: string
  recipientName: string
  recipientPhone: string
  shippingAddress: ShippingAddressInput
  packageCount: number
  totalWeightKg: number | null
  notes: string | null
  currentLabelId: string | null
  shippedAt: string | null
  deliveredAt: string | null
  cancelledAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ShippingEventRecord {
  id: string
  shipmentId: string
  provider: string
  eventType: string
  previousStatus: string | null
  newStatus: string
  description: string
  location?: string | null
  externalEventId?: string | null
  payload?: Record<string, unknown> | null
  occurredAt: string
  receivedAt: string
  idempotencyKey: string
  createdAt: string
}

export interface CarrierConnectionTestResult {
  success: boolean
  provider: CarrierProviderType
  latencyMs: number
  message: string
  environment: 'STAGE' | 'PRODUCTION' | 'MOCK'
  configured: boolean
}
