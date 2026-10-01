import type { ShippingLabelFormat, ShippingLabelStatus, ShippingAddressInput } from '../shipping-types'

export interface RenderLabelOptions {
  shipmentId: string
  trackingNumber: string
  carrier: string
  orderNumber: string
  marketplaceOrderNumber?: string | null
  channel: 'DIRECT' | 'MARKETPLACE'
  recipient: ShippingAddressInput
  packageNumber?: string | null
  packageCount?: number
  totalWeightKg?: number | null
  serviceType?: string
  codAmount?: number | null
  senderName?: string
  senderAddress?: string
  senderPhone?: string
}

export interface RenderedLabelOutput {
  format: ShippingLabelFormat
  data: string // Raw Base64 string for PDF/PNG/JPG or plain text for ZPL
  mimeType: string
  widthMm: number
  heightMm: number
  checksum: string
}
