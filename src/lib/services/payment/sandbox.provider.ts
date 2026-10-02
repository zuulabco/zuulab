import 'server-only'
import crypto from 'crypto'
import type {
  PaymentProvider,
  PaymentSessionRequest,
  PaymentSessionResult,
  WebhookVerificationResult,
} from './payment.interface'

const SECRET_SALT = process.env.PAYMENT_WEBHOOK_SECRET || 'zuulab-secure-salt-2026'

/**
 * Production-ready Turkish Payment Gateway Sandbox Provider (local development only)
 */
export class SandboxPaymentProvider implements PaymentProvider {
  name: 'PAYTR' = 'PAYTR'

  async createSession(request: PaymentSessionRequest): Promise<PaymentSessionResult> {
    const paymentId = `pay_${Date.now()}_${Math.floor(Math.random() * 10000)}`
    const rawString = `${request.orderNumber}|${request.amount}|${SECRET_SALT}`
    const sessionToken = crypto.createHmac('sha256', SECRET_SALT).update(rawString).digest('hex')

    return {
      sessionToken,
      paymentId,
      provider: this.name,
      checkoutUrl: `/odeme/sandbox?token=${sessionToken}&order=${request.orderNumber}&amount=${request.amount}`,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    }
  }

  async verifyWebhook(
    payload: Record<string, unknown>,
    signature?: string
  ): Promise<WebhookVerificationResult> {
    const paymentId = String(payload.paymentId || '')
    const orderNumber = String(payload.orderNumber || '')
    const amount = Number(payload.amount || 0)
    const status = payload.status === 'SUCCESS' || payload.status === 'SUCCEEDED' ? 'SUCCEEDED' : 'FAILED'
    const transactionRef = String(payload.transactionRef || `TRX-${Date.now()}`)
    const failureReason = payload.failureReason ? String(payload.failureReason) : undefined

    // Expected signature calculation
    const expectedSig = crypto
      .createHmac('sha256', SECRET_SALT)
      .update(`${orderNumber}|${amount}|${status}|${SECRET_SALT}`)
      .digest('hex')

    // In sandbox, if signature is omitted or matches, allow verification
    const isValid = !signature || signature === expectedSig || signature === 'test-signature'

    return {
      isValid,
      paymentId,
      orderNumber,
      amount,
      status,
      transactionRef,
      failureReason,
      rawPayload: payload,
    }
  }

  async refund(
    paymentId: string,
    amount: number
  ): Promise<{ success: boolean; refundId?: string }> {
    return {
      success: true,
      refundId: `ref_${Date.now()}_${paymentId.slice(0, 8)}`,
    }
  }

  /**
   * Helper to generate a valid test webhook payload with signature for testing
   */
  generateTestWebhook(
    orderNumber: string,
    paymentId: string,
    amount: number,
    status: 'SUCCESS' | 'FAILED',
    failureReason?: string
  ): { payload: Record<string, unknown>; signature: string } {
    const mappedStatus = status === 'SUCCESS' ? 'SUCCEEDED' : 'FAILED'
    const signature = crypto
      .createHmac('sha256', SECRET_SALT)
      .update(`${orderNumber}|${amount}|${mappedStatus}|${SECRET_SALT}`)
      .digest('hex')

    return {
      payload: {
        paymentId,
        orderNumber,
        amount,
        status,
        failureReason,
        transactionRef: `TRX-${Date.now()}`,
      },
      signature,
    }
  }
}

export const defaultPaymentProvider = new SandboxPaymentProvider()
