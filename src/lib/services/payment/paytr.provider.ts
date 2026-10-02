import 'server-only'
import crypto from 'crypto'
import { normalizeIp } from '@/lib/config/maintenance'
import type {
  PaymentProvider,
  PaymentSessionRequest,
  PaymentSessionResult,
  WebhookVerificationResult,
} from './payment.interface'

/**
 * Formats basket items for PayTR user_basket specification.
 * Guarantees that the sum of item prices and shipping in user_basket
 * matches targetTotalTL to the exact kuruş, without negative prices.
 */
export function formatBasketForPayTR(
  items: Array<{ name: string; price: number; quantity: number }>,
  targetTotalTL: number,
  shippingAmountTL: number = 0
): Array<[string, string, number]> {
  const targetKurus = Math.round(targetTotalTL * 100)
  const shippingKurus = Math.max(0, Math.round(shippingAmountTL * 100))
  const itemsTargetKurus = targetKurus - shippingKurus

  const rawSubtotalKurus = items.reduce(
    (sum, item) => sum + Math.round(item.price * 100) * item.quantity,
    0
  )

  const basket: Array<[string, string, number]> = []

  if (items.length === 0) {
    return [['Sipariş Tutarı', targetTotalTL.toFixed(2), 1]]
  }

  if (itemsTargetKurus <= 0) {
    basket.push(['Test Ürün / Hizmet', '0.00', 1])
  } else if (rawSubtotalKurus === itemsTargetKurus) {
    for (const item of items) {
      basket.push([
        item.name.slice(0, 200),
        item.price.toFixed(2),
        item.quantity,
      ])
    }
  } else {
    // Discount applied: distribute itemsTargetKurus proportionally across items
    let allocatedKurus = 0
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const isLast = i === items.length - 1
      const itemRawTotalKurus = Math.round(item.price * 100) * item.quantity

      let itemEffectiveTotalKurus: number
      if (isLast) {
        itemEffectiveTotalKurus = itemsTargetKurus - allocatedKurus
      } else {
        const ratio = itemRawTotalKurus / rawSubtotalKurus
        itemEffectiveTotalKurus = Math.round(itemsTargetKurus * ratio)
        allocatedKurus += itemEffectiveTotalKurus
      }

      const qty = item.quantity
      const baseUnitPriceKurus = Math.floor(itemEffectiveTotalKurus / qty)
      const remainderKurus = itemEffectiveTotalKurus % qty

      if (remainderKurus === 0) {
        basket.push([
          item.name.slice(0, 200),
          (baseUnitPriceKurus / 100).toFixed(2),
          qty,
        ])
      } else {
        // Split remainder kuruş so unit prices are valid 2-decimal numbers summing exactly to total
        const normalQty = qty - remainderKurus
        if (normalQty > 0) {
          basket.push([
            item.name.slice(0, 200),
            (baseUnitPriceKurus / 100).toFixed(2),
            normalQty,
          ])
        }
        basket.push([
          item.name.slice(0, 200),
          ((baseUnitPriceKurus + 1) / 100).toFixed(2),
          remainderKurus,
        ])
      }
    }
  }

  if (shippingKurus > 0) {
    basket.push([
      'Kargo Ücreti',
      (shippingKurus / 100).toFixed(2),
      1,
    ])
  }

  return basket
}

/**
 * PayTR's merchant_oid must be alphanumeric and unique per payment attempt.
 * Example: order ZUU123456789012, attempt 2 -> "ZUU123456789012A2".
 */
export function buildMerchantOid(orderNumber: string, attemptNumber: number): string {
  const base = orderNumber.replace(/[^A-Za-z0-9]/g, '')
  return attemptNumber > 1 ? `${base}A${attemptNumber}` : base
}

// Keys for the local simulator only; never valid against PayTR or in production.
const DEV_SIMULATION_KEY = 'zuulab-paytr-dev-key'
const DEV_SIMULATION_SALT = 'zuulab-paytr-dev-salt'

/**
 * The simulator (fake session + self-signed callback) is only available in local
 * development when no real merchant credentials are configured. Vercel preview and
 * production builds both run with NODE_ENV=production.
 */
export function isPayTRSimulationAllowed(isLiveConfigured: boolean): boolean {
  return !isLiveConfigured && process.env.NODE_ENV !== 'production'
}

function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  return aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf)
}

/**
 * PayTR Payment Gateway Integration for Zuulab
 * Supports iframe token generation, webhook signature verification (HMAC-SHA256),
 * and automatic simulated test mode when merchant credentials are not yet set.
 */
export class PayTRPaymentProvider implements PaymentProvider {
  name: 'PAYTR' = 'PAYTR'

  private merchantId: string
  private merchantKey: string
  private merchantSalt: string
  private isTestMode: boolean
  private isLiveConfigured: boolean

  constructor() {
    this.merchantId = process.env.PAYTR_MERCHANT_ID || ''
    this.merchantKey = process.env.PAYTR_MERCHANT_KEY || ''
    this.merchantSalt = process.env.PAYTR_MERCHANT_SALT || ''
    this.isTestMode = process.env.PAYTR_TEST_MODE !== '0'

    // Considered live-configured if merchant credentials are provided and non-dummy
    this.isLiveConfigured = Boolean(
      this.merchantId &&
      this.merchantKey &&
      this.merchantSalt &&
      !this.merchantId.includes('your_') &&
      !this.merchantKey.includes('your_')
    )
  }

  /**
   * Generates a PayTR Iframe Session Token
   * POST to https://www.paytr.com/odeme/api/get-token
   */
  async createSession(request: PaymentSessionRequest): Promise<PaymentSessionResult> {
    const attemptNumber = request.attemptNumber || 1
    const merchantOid = request.merchantOid || buildMerchantOid(request.orderNumber, attemptNumber)

    const paymentId = `paytr_${Date.now()}_${Math.floor(Math.random() * 10000)}`
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const merchantOkUrl = request.merchantOkUrl || `${appUrl}/odeme/basarili?order=${request.orderNumber}`
    const merchantFailUrl = request.merchantFailUrl || `${appUrl}/odeme/basarisiz?order=${request.orderNumber}`

    // If live PayTR credentials are configured, request token from PayTR API
    if (this.isLiveConfigured) {
      try {
        const userIp = normalizeIp(request.customer.ip) || '127.0.0.1'
        const email = request.customer.email
        // PayTR expects payment amount in kuruş (e.g. 100.50 TL -> 10050)
        const paymentAmountKurus = Math.round(request.amount * 100)

        // Basket format for PayTR: JSON string array of [name, price_str, quantity]
        const userBasketArray = formatBasketForPayTR(
          request.items,
          request.amount,
          request.shippingAmount || 0
        )
        const userBasket = JSON.stringify(userBasketArray)
        const userBasketBase64 = Buffer.from(userBasket).toString('base64')

        const noInstallment = '0'
        const maxInstallment = '0'
        const currency = request.currency === 'USD' ? 'USD' : request.currency === 'EUR' ? 'EUR' : 'TL'
        const testMode = this.isTestMode ? '1' : '0'

        // PayTR hash formulation:
        // merchant_id + user_ip + merchant_oid + email + payment_amount + user_basket + no_installment + max_installment + currency + test_mode + merchant_salt
        const hashStr = `${this.merchantId}${userIp}${merchantOid}${email}${paymentAmountKurus}${userBasketBase64}${noInstallment}${maxInstallment}${currency}${testMode}`
        const paytrToken = crypto
          .createHmac('sha256', this.merchantKey)
          .update(hashStr + this.merchantSalt)
          .digest('base64')

        const postData = new URLSearchParams({
          merchant_id: this.merchantId,
          user_ip: userIp,
          merchant_oid: merchantOid,
          email: email,
          payment_amount: paymentAmountKurus.toString(),
          paytr_token: paytrToken,
          user_basket: userBasketBase64,
          user_name: request.customer.fullName,
          user_address: request.address?.addressLine || 'Adres belirtilmedi',
          user_phone: request.customer.phone,
          merchant_ok_url: merchantOkUrl,
          merchant_fail_url: merchantFailUrl,
          timeout_limit: '30',
          currency: currency,
          test_mode: testMode,
          no_installment: noInstallment,
          max_installment: maxInstallment,
        })

        const res = await fetch('https://www.paytr.com/odeme/api/get-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: postData.toString(),
        })

        const result = (await res.json()) as { status: string; token?: string; reason?: string }

        if (result.status === 'success' && result.token) {
          return {
            sessionToken: result.token,
            paymentId,
            provider: 'PAYTR',
            checkoutUrl: `/odeme/paytr?token=${result.token}&order=${request.orderNumber}`,
            iframeUrl: `https://www.paytr.com/odeme/guvenli/${result.token}`,
            expiresAt,
            attemptNumber,
          }
        }
        console.error('[paytr.provider] PayTR token error:', result.reason)
        throw new Error(`PAYTR_TOKEN_ERROR: ${result.reason || 'PayTR ödeme oturumu oluşturulamadı.'}`)
      } catch (err) {
        // With real credentials configured a failed token request must surface as a
        // failure; falling through to the simulator would hand out a fake session.
        if (err instanceof Error && err.message.startsWith('PAYTR_TOKEN_ERROR')) throw err
        console.error('[paytr.provider] Failed to communicate with PayTR API:', err)
        throw new Error('PAYTR_TOKEN_ERROR: PayTR servisine ulaşılamadı.')
      }
    }

    if (!isPayTRSimulationAllowed(this.isLiveConfigured)) {
      throw new Error('PAYTR_CONFIGURATION_ERROR: PayTR merchant credentials (PAYTR_MERCHANT_ID, PAYTR_MERCHANT_KEY, PAYTR_MERCHANT_SALT) must be configured in production.')
    }

    // Local simulation for development without PayTR credentials
    const hashData = `${merchantOid}|${request.amount}|${DEV_SIMULATION_SALT}`
    const sessionToken = crypto.createHmac('sha256', DEV_SIMULATION_KEY).update(hashData).digest('hex')

    return {
      sessionToken,
      paymentId,
      provider: 'PAYTR',
      checkoutUrl: `/odeme/paytr?token=${sessionToken}&order=${request.orderNumber}&amount=${request.amount}&attempt=${attemptNumber}&simulated=true`,
      iframeUrl: `https://www.paytr.com/odeme/guvenli/${sessionToken}`,
      expiresAt,
      attemptNumber,
    }
  }

  /**
   * Verifies incoming PayTR webhook callback
   * PayTR sends: merchant_oid, status ("success"|"failed"), total_amount (kuruş), hash
   * Expected hash: base64(hmac_sha256(merchant_oid + merchant_salt + status + total_amount, merchant_key))
   */
  async verifyWebhook(
    payload: Record<string, unknown>,
    incomingSignature?: string
  ): Promise<WebhookVerificationResult> {
    const merchantOid = String(payload.merchant_oid || payload.orderNumber || '')
    // Informational only: payments are matched on merchantOid. Handles both the
    // current "ZUU…A2" and the legacy "ZUU-…-ATT2" attempt suffixes.
    const orderNumber = merchantOid.split('-ATT')[0].replace(/A\d+$/, '')
    const statusRaw = String(payload.status || '').toLowerCase()
    const isSuccess = statusRaw === 'success' || statusRaw === 'succeeded'

    // Amount can come in kuruş from PayTR (total_amount) or in TL (amount)
    let amountInTL = 0
    let totalAmountKurus = ''
    if (payload.total_amount !== undefined) {
      const kurusNum = Number(payload.total_amount)
      amountInTL = Math.round((kurusNum / 100) * 100) / 100
      totalAmountKurus = String(payload.total_amount)
    } else if (payload.amount !== undefined) {
      amountInTL = Number(payload.amount)
      totalAmountKurus = String(Math.round(amountInTL * 100))
    }

    const salt = this.isLiveConfigured ? this.merchantSalt : DEV_SIMULATION_SALT
    const key = this.isLiveConfigured ? this.merchantKey : DEV_SIMULATION_KEY
    const paymentId = String(payload.paymentId || `paytr_${merchantOid}`)
    const transactionRef = String(
      payload.transactionRef || payload.trans_id || `PAYTR-${Date.now()}`
    )
    const failureReason = payload.failed_reason_msg
      ? String(payload.failed_reason_msg)
      : payload.failureReason
      ? String(payload.failureReason)
      : undefined

    // Calculate official PayTR HMAC signature
    const hashData = `${merchantOid}${salt}${statusRaw}${totalAmountKurus}`
    const calculatedPayTrHash = crypto
      .createHmac('sha256', key)
      .update(hashData)
      .digest('base64')

    const signatureToCheck = String(
      incomingSignature || payload.hash || ''
    )

    let isValid: boolean
    if (this.isLiveConfigured) {
      // Real merchant credentials: only PayTR's own HMAC is accepted, in every environment.
      isValid = safeEqual(signatureToCheck, calculatedPayTrHash)
    } else if (isPayTRSimulationAllowed(false)) {
      // Local development without credentials: accept simulator signatures.
      isValid =
        !signatureToCheck ||
        signatureToCheck === 'test-signature' ||
        safeEqual(signatureToCheck, calculatedPayTrHash)
    } else {
      isValid = false
    }

    const installmentCount = payload.installment_count !== undefined ? Number(payload.installment_count) : NaN

    return {
      isValid,
      paymentId,
      orderNumber,
      merchantOid,
      amount: amountInTL,
      installmentCount: Number.isFinite(installmentCount) ? installmentCount : undefined,
      currency: 'TRY',
      status: isSuccess ? 'SUCCEEDED' : 'FAILED',
      transactionRef,
      failureReason,
      rawPayload: payload,
    }
  }

  /**
   * PayTR Refund API call
   */
  async refund(
    paymentId: string,
    amount: number
  ): Promise<{ success: boolean; refundId?: string }> {
    if (!this.isLiveConfigured) {
      if (!isPayTRSimulationAllowed(false)) {
        console.error('[paytr.provider] Refund requested without PayTR credentials configured.')
        return { success: false }
      }
      return {
        success: true,
        refundId: `ref_paytr_${Date.now()}`,
      }
    }

    try {
      const returnAmountKurus = Math.round(amount * 100)
      const paytrToken = crypto
        .createHmac('sha256', this.merchantKey)
        .update(`${this.merchantId}${paymentId}${returnAmountKurus}${this.merchantSalt}`)
        .digest('base64')

      const res = await fetch('https://www.paytr.com/odeme/iade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          merchant_id: this.merchantId,
          merchant_oid: paymentId,
          return_amount: returnAmountKurus.toString(),
          paytr_token: paytrToken,
        }).toString(),
      })

      const data = (await res.json()) as { status: string; is_test?: number; err_msg?: string }
      return {
        success: data.status === 'success',
        refundId: data.status === 'success' ? `ref_${paymentId}` : undefined,
      }
    } catch (err) {
      console.error('[paytr.provider] Refund error:', err)
      return { success: false }
    }
  }

  /**
   * Test helper to generate a mathematically valid PayTR webhook payload with official signature
   */
  generateTestWebhook(
    merchantOid: string,
    amountTL: number,
    status: 'SUCCESS' | 'FAILED',
    failureReason?: string
  ): { payload: Record<string, unknown>; signature: string } {
    // Signing with real merchant secrets would let anyone who can reach the caller
    // forge a paid callback, so the simulator only ever uses the dev keys.
    if (!isPayTRSimulationAllowed(this.isLiveConfigured)) {
      throw new Error('PAYTR_SIMULATION_DISABLED: Test ödeme simülasyonu bu ortamda kapalıdır.')
    }
    const statusStr = status === 'SUCCESS' ? 'success' : 'failed'
    const totalAmountKurus = String(Math.round(amountTL * 100))

    const hashData = `${merchantOid}${DEV_SIMULATION_SALT}${statusStr}${totalAmountKurus}`
    const signature = crypto.createHmac('sha256', DEV_SIMULATION_KEY).update(hashData).digest('base64')

    return {
      payload: {
        merchant_oid: merchantOid,
        status: statusStr,
        total_amount: totalAmountKurus,
        hash: signature,
        payment_amount: totalAmountKurus,
        failed_reason_msg: failureReason,
        transactionRef: `PAYTR-TRX-${Date.now()}`,
      },
      signature,
    }
  }
}
