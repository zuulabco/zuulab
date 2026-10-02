import { NextResponse } from 'next/server'
import { handlePaymentWebhook } from '@/lib/services/payment/payment.service'

/**
 * Production Payment Webhook Endpoint
 * PayTR callback (sandbox in local development).
 * Accepts both JSON and application/x-www-form-urlencoded payloads.
 * Returns raw "OK" for PayTR callbacks (per PayTR API specification).
 */
export async function POST(request: Request) {
  let isPayTR = false

  try {
    const contentType = request.headers.get('content-type') || ''
    let payload: Record<string, unknown> = {}

    // PayTR sends application/x-www-form-urlencoded
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const text = await request.text()
      const params = new URLSearchParams(text)
      params.forEach((value, key) => {
        payload[key] = value
      })
      isPayTR = Boolean(payload.merchant_oid || payload.hash)
    } else if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      formData.forEach((value, key) => {
        payload[key] = typeof value === 'string' ? value : value.name
      })
      isPayTR = Boolean(payload.merchant_oid || payload.hash)
    } else {
      payload = await request.json().catch(() => ({}))
      isPayTR = Boolean(payload.merchant_oid || payload.hash)
    }

    const signature =
      (payload.hash as string) ||
      request.headers.get('x-payment-signature') ||
      request.headers.get('x-paytr-token') ||
      request.headers.get('x-iyzi-signature') ||
      undefined

    const result = await handlePaymentWebhook(payload, signature)

    // PayTR expects EXACTLY the text "OK" with HTTP 200
    if (isPayTR || payload.merchant_oid) {
      return new Response('OK', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    return NextResponse.json({
      status: 'OK',
      ...result,
    })
  } catch (error: any) {
    console.error('[payments/webhook] Webhook error:', error)
    const isSecurity = error.message?.includes('SECURITY')

    // If PayTR triggered this, PayTR retries if status != 200 or response != "OK"
    if (isPayTR) {
      return new Response(error.message || 'PAYTR WEBHOOK ERROR', {
        status: isSecurity ? 403 : 400,
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    return NextResponse.json(
      { status: 'ERROR', error: error.message || 'Webhook işlenemedi.' },
      { status: isSecurity ? 403 : 500 }
    )
  }
}
