// Order-related TypeScript types

export type OrderStatus =
  | 'PAYMENT_PENDING'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_RECEIVED'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'IN_PRODUCTION'
  | 'PACKING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURN_REQUESTED'
  | 'RETURNED'
  | 'PARTIALLY_REFUNDED'

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PAYMENT_PENDING: 'Ödeme Bekleniyor',
  PAYMENT_FAILED: 'Ödeme Başarısız',
  PAYMENT_RECEIVED: 'Ödeme Alındı',
  CONFIRMED: 'Onaylandı',
  PREPARING: 'Hazırlanıyor',
  IN_PRODUCTION: 'Üretimde',
  PACKING: 'Paketleniyor',
  SHIPPED: 'Kargoya Verildi',
  DELIVERED: 'Teslim Edildi',
  CANCELLED: 'İptal Edildi',
  RETURN_REQUESTED: 'İade Talep Edildi',
  RETURNED: 'İade Edildi',
  PARTIALLY_REFUNDED: 'Kısmi İade',
}

export const ORDER_STATUS_COLOR: Record<OrderStatus, string> = {
  PAYMENT_PENDING: 'warning',
  PAYMENT_FAILED: 'error',
  PAYMENT_RECEIVED: 'info',
  CONFIRMED: 'info',
  PREPARING: 'info',
  IN_PRODUCTION: 'brand',
  PACKING: 'brand',
  SHIPPED: 'brand',
  DELIVERED: 'success',
  CANCELLED: 'error',
  RETURN_REQUESTED: 'warning',
  RETURNED: 'default',
  PARTIALLY_REFUNDED: 'warning',
}

export interface OrderListItem {
  id: string
  orderNumber: string
  status: OrderStatus
  total: number
  itemCount: number
  createdAt: string
  updatedAt: string
}

export interface OrderDetail extends OrderListItem {
  subtotal: number
  discountAmount: number
  shippingCost: number
  taxAmount: number
  items: OrderItem[]
  statusHistory: OrderStatusHistory[]
  payment: OrderPayment | null
  shipment: OrderShipment | null
  shippingAddress: OrderAddress
  couponCode: string | null
  customerNote: string | null
}

export interface OrderItem {
  id: string
  productName: string
  variantInfo: string | null
  sku: string
  quantity: number
  unitPrice: number
  total: number
  imageUrl: string | null
}

export interface OrderStatusHistory {
  id: string
  status: OrderStatus
  note: string | null
  createdAt: string
}

export interface OrderPayment {
  provider: string
  status: string
  amount: number
  paidAt: string | null
}

export interface OrderShipment {
  provider: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  status: string
  shippedAt: string | null
  estimatedAt: string | null
}

export interface OrderAddress {
  firstName: string
  lastName: string
  phone: string
  addressLine1: string
  addressLine2: string | null
  city: string
  district: string
  postalCode: string
  country: string
}
