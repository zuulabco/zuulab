import { NextResponse } from 'next/server'
import { retryPayment } from '@/lib/services/payment/payment.service'

/**
 * Payment Retry Endpoint
 * Initiates a new payment attempt for an existing failed or pending order.
 * Re-reserves stock, creates attempt #N, and returns a new payment session URL.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const { orderNumber } = body

    if (!orderNumber || typeof orderNumber !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Sipariş numarası (orderNumber) zorunludur.' },
        { status: 400 }
      )
    }

    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1'

    const sessionResult = await retryPayment({
      orderNumber,
      ipAddress: clientIp,
    })

    return NextResponse.json({
      success: true,
      orderNumber,
      paymentId: sessionResult.paymentId,
      sessionToken: sessionResult.sessionToken,
      checkoutUrl: sessionResult.checkoutUrl,
      attemptNumber: sessionResult.attemptNumber,
      expiresAt: sessionResult.expiresAt,
    })
  } catch (error: any) {
    console.error('[payments/retry] Retry error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Ödeme tekrar başlatılamadı.' },
      { status: 400 }
    )
  }
}
