export type NotificationEventType =
  | 'ORDER_CREATED'
  | 'ORDER_CONFIRMED'
  | 'ORDER_CANCELLED'
  | 'PAYMENT_SUCCEEDED'
  | 'PAYMENT_FAILED'
  | 'ORDER_PREPARING'
  | 'SHIPMENT_CREATED'
  | 'ORDER_SHIPPED'
  | 'OUT_FOR_DELIVERY'
  | 'ORDER_DELIVERED'
  | 'DELIVERY_FAILED'
  | 'RETURN_REQUESTED'
  | 'RETURN_APPROVED'
  | 'RETURN_REJECTED'
  | 'RETURN_SHIPMENT_CREATED'
  | 'RETURN_IN_TRANSIT'
  | 'RETURN_RECEIVED'
  | 'RETURN_INSPECTED'
  | 'REFUND_PENDING'
  | 'REFUND_ISSUED'
  | 'EXCHANGE_APPROVED'
  | 'EXCHANGE_COMPLETED'

export type NotificationChannel = 'EMAIL' | 'SMS'

export type NotificationStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SENT'
  | 'FAILED'
  | 'CANCELLED'

export interface StoredNotification {
  id: string
  userId?: string | null
  orderId?: string | null
  orderNumber?: string | null
  type: NotificationEventType
  channel: NotificationChannel
  status: NotificationStatus
  subject: string
  recipient: string
  htmlContent: string
  textContent: string
  provider: string
  providerMessageId?: string | null
  idempotencyKey: string
  scheduledAt?: string | null
  sentAt?: string | null
  failedAt?: string | null
  lastError?: string | null
  retryCount: number
  metadata?: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface EmailSendOptions {
  to: string
  subject: string
  html: string
  text?: string
  from?: string
  /** Where customer replies go (e.g. a monitored inbox when sending from a no-reply address). */
  replyTo?: string
  /** Extra headers, e.g. List-Unsubscribe for newsletters. */
  headers?: Record<string, string>
  idempotencyKey?: string
}

export interface EmailSendResult {
  success: boolean
  providerMessageId?: string
  error?: string
}

export interface EmailProvider {
  readonly providerName: string
  sendEmail(options: EmailSendOptions): Promise<EmailSendResult>
  normalizeError(error: unknown): string
}
