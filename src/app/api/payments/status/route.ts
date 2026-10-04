import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/security/rate-limit-response'
import { authenticateRequest } from '@/lib/services/auth.service'
import { findOrderByNumber } from '@/lib/services/orders.service'
import { reconcileOrderPayment } from '@/lib/services/payment/payment.service'
import { hasOrderAccess } from '@/lib/services/session.service'

export const dynamic = 'force-dynamic'

/**
 * Payment outcome of an order, polled by the PayTR page. PayTR's own redirect of the
 * top window can be blocked by the browser, so the page also watches the order the
 * callback updates and moves the customer on itself.
 *
 * Same authorization as payment retry: owner, admin, or the browser that created
 * the order (order-access cookie). Returns the status, plus what the havale/EFT
 * page shows: payment method, amount and the payment deadline.
 */
export async function GET(request: Request) {
  const limited = await rateLimit(request, 'paymentStatus')
  if (limited) return limited

  const orderNumber = new URL(request.url).searchParams.get('order') || ''
  if (!orderNumber) {
    return NextResponse.json({ success: false, error: 'Sipariş numarası gereklidir.' }, { status: 400 })
  }

  const order = await findOrderByNumber(orderNumber)
  const user = order ? await authenticateRequest(request).catch(() => null) : null
  const allowed =
    order &&
    (hasOrderAccess(request, order.orderNumber) ||
      (user && (user.id === order.userId || user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')))

  if (!order || !allowed) {
    return NextResponse.json({ success: false, error: 'Sipariş bulunamadı.' }, { status: 404 })
  }

  // If PayTR's notification is late or lost, ask PayTR directly (throttled).
  let current = order
  if (order.status === 'PAYMENT_PENDING') {
    const { reconciled } = await reconcileOrderPayment(order.orderNumber).catch(() => ({ reconciled: false }))
    if (reconciled) current = (await findOrderByNumber(order.orderNumber)) ?? order
  }

  return NextResponse.json(
    {
      success: true,
      status: current.status,
      paymentStatus: current.paymentStatus,
      paymentMethod: current.paymentMethod,
      totalAmount: current.totalAmount,
      paymentExpiresAt: current.paymentExpiresAt,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
