export type PaymentProviderName = 'PAYTR' | 'IYZICO' | 'STRIPE' | 'MANUAL' | 'SANDBOX'

export type PaymentStatusName =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED'
  | 'CANCELLED'

export interface PaymentSessionRequest {
  orderNumber: string
  amount: number
  currency: string
  customer: {
    fullName: string
    email: string
    phone: string
    ip?: string
  }
  address?: {
    addressLine: string
    city: string
    district?: string
    postalCode?: string
    country?: string
  }
  items: Array<{
    name: string
    price: number
    quantity: number
  }>
  shippingAmount?: number
  discountAmount?: number
  subtotal?: number
  merchantOkUrl?: string
  merchantFailUrl?: string
  callbackUrl?: string
  attemptNumber?: number
  /** Identifier sent to the provider; must be unique per attempt (PayTR: alphanumeric). */
  merchantOid?: string
}

export interface PaymentSessionResult {
  sessionToken: string
  paymentId: string
  provider: PaymentProviderName
  checkoutUrl?: string
  iframeUrl?: string
  expiresAt: string
  attemptNumber?: number
}

export interface WebhookVerificationResult {
  isValid: boolean
  paymentId: string
  orderNumber: string
  /** The identifier we sent when opening the session; the authoritative match key. */
  merchantOid?: string
  /** Amount actually charged; includes installment interest when installments were used. */
  amount: number
  installmentCount?: number
  currency?: string
  status: 'SUCCEEDED' | 'FAILED'
  transactionRef?: string
  failureReason?: string
  rawPayload: Record<string, unknown>
}

export interface PaymentProvider {
  name: PaymentProviderName
  createSession(request: PaymentSessionRequest): Promise<PaymentSessionResult>
  verifyWebhook(payload: Record<string, unknown>, signature?: string): Promise<WebhookVerificationResult>
  refund(paymentId: string, amount: number): Promise<{ success: boolean; refundId?: string }>
}
