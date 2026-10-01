export type ReturnType = 'RETURN' | 'EXCHANGE'

export type ReturnStatus =
  | 'REQUESTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'RETURN_SHIPPING_CREATED'
  | 'IN_TRANSIT'
  | 'RECEIVED'
  | 'INSPECTED'
  | 'REFUND_PENDING'
  | 'EXCHANGE_PENDING'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'FAILED'

export type ReturnInspectionResolution = 'RESTOCK' | 'NOT_RESTOCKABLE' | 'SCRAP'

export const VALID_RETURN_TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  REQUESTED: ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['RETURN_SHIPPING_CREATED', 'IN_TRANSIT', 'RECEIVED', 'REJECTED', 'CANCELLED'],
  RETURN_SHIPPING_CREATED: ['IN_TRANSIT', 'RECEIVED', 'CANCELLED'],
  IN_TRANSIT: ['RECEIVED', 'FAILED'],
  RECEIVED: ['INSPECTED'],
  INSPECTED: ['INSPECTED', 'REFUND_PENDING', 'EXCHANGE_PENDING', 'COMPLETED', 'REJECTED'],
  REFUND_PENDING: ['COMPLETED', 'FAILED'],
  EXCHANGE_PENDING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
  FAILED: ['REFUND_PENDING', 'UNDER_REVIEW', 'CANCELLED'],
}

export type ReturnReason =
  | 'EXPECTATION_NOT_MET'
  | 'WRONG_ITEM'
  | 'DAMAGED_ITEM'
  | 'DEFECTIVE_ITEM'
  | 'SIZE_MISMATCH'
  | 'OTHER'

export const RETURN_REASONS_MAP: Record<ReturnReason, string> = {
  EXPECTATION_NOT_MET: 'Ürün beklentimi karşılamadı',
  WRONG_ITEM: 'Yanlış ürün gönderildi',
  DAMAGED_ITEM: 'Hasarlı / Kırık ürün',
  DEFECTIVE_ITEM: 'Kusurlu / Ayıplı ürün',
  SIZE_MISMATCH: 'Beden / Ölçü uyumsuzluğu',
  OTHER: 'Diğer',
}

export interface ReturnItemInput {
  orderItemId?: string
  productId: string
  quantity: number
  reason?: ReturnReason | string
  customerNote?: string
  replacementSku?: string
}

export interface ReturnItem {
  id: string
  returnRequestId: string
  orderItemId: string
  productId: string
  productName: string
  sku: string
  quantity: number
  unitPrice: number
  reason: string
  customerNote?: string
  condition?: string
  inspectionResult?: string
  resolution?: ReturnInspectionResolution
  replacementSku?: string
  restocked: boolean
  restockedAt?: string | null
}

export interface ReturnShipmentRecord {
  id: string
  returnRequestId: string
  provider: string
  trackingNumber: string
  trackingUrl: string
  labelData?: string
  status: string
  shippedAt?: string | null
  deliveredAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface ReturnEventRecord {
  id: string
  returnRequestId: string
  status: ReturnStatus
  note?: string
  metadata?: Record<string, unknown>
  createdAt: string
  createdBy?: string
}

export interface ReturnRequest {
  id: string
  returnNumber: string
  orderId: string
  orderNumber: string
  userId: string
  customerName: string
  customerEmail: string
  type: ReturnType
  status: ReturnStatus
  reason: string
  customerNote?: string
  adminNote?: string
  items: ReturnItem[]
  shipment?: ReturnShipmentRecord | null
  refundAmount: number
  refundStatus?: 'PENDING' | 'COMPLETED' | 'FAILED'
  refundRef?: string | null
  exchangeOrderNumber?: string | null
  replacementOrderNumber?: string | null
  photos?: string[]
  photoUrls?: string[]
  requestedAt: string
  approvedAt?: string | null
  rejectedAt?: string | null
  receivedAt?: string | null
  inspectedAt?: string | null
  completedAt?: string | null
  events: ReturnEventRecord[]
  createdAt: string
  updatedAt: string
}

export interface CreateReturnRequestInput {
  orderNumber: string
  userId: string
  type: ReturnType
  reason: ReturnReason | string
  customerNote?: string
  items: ReturnItemInput[]
  photos?: string[]
}
