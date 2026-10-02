import { NextResponse } from 'next/server'
import { retryPayment } from '@/lib/services/payment/payment.service'
import { authenticateRequest } from '@/lib/services/auth.service'
import { getOrderByNumber } from '@/lib/services/orders.service'
import { hasOrderAccess } from '@/lib/services/session.service'
import { getClientIp } from '@/lib/config/maintenance'

/**
 * Payment Retry Endpoint
 * Initiates a new payment attempt for an existing failed or pending order.
 * Re-reserves stock, creates attempt #N, and returns a new payment session URL.
 *
 * Only the order's owner (signed-in), the browser that created it (order-access
 * cookie, for guests) or an admin may retry; otherwise anyone knowing an order
 * number could re-open payment sessions and hold stock.
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

    const order = await getOrderByNumber(orderNumber, undefined, true)
    if (!order) {
      return NextResponse.json(
        { success: false, error: 'Sipariş bulunamadı.' },
        { status: 404 }
      )
    }

    const user = await authenticateRequest(request)
    const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'
    const isOwner = Boolean(user && order.userId === user.id)
    if (!isAdmin && !isOwner && !hasOrderAccess(request, order.orderNumber)) {
      return NextResponse.json(
        { success: false, error: 'Bu sipariş için ödeme başlatma yetkiniz yok.' },
        { status: 403 }
      )
    }

    const sessionResult = await retryPayment({
      orderNumber: order.orderNumber,
      ipAddress: getClientIp(new Headers(request.headers)),
    })

    return NextResponse.json({
      success: true,
      orderNumber: order.orderNumber,
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
