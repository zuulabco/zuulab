import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/security/rate-limit-response'
import { authenticateRequest } from '@/lib/services/auth.service'
import { findOrderByNumber } from '@/lib/services/orders.service'
import { hasOrderAccess } from '@/lib/services/session.service'
import { buildPurchaseEvent } from '@/lib/marketing/purchase'

export const dynamic = 'force-dynamic'

/**
 * The canonical `purchase` event of an order, for the browser's order-success page to
 * send to its destinations (Meta Pixel later). The values come from the order in the
 * database, never from the cart or the page, and the event id is the same
 * `purchase_<orderNumber>` the server copy uses, so both copies deduplicate.
 *
 * Same authorization as the payment status poll: the order's owner, an admin, or the
 * browser that placed it. 404 until the order is really a sale, so opening this page
 * for an unpaid or failed order never produces a purchase.
 */
export async function GET(request: Request) {
  const limited = await rateLimit(request, 'orderLookup')
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

  const event = buildPurchaseEvent(order)
  if (!event) {
    return NextResponse.json({ success: false, error: 'Sipariş henüz satışa dönüşmedi.' }, { status: 404 })
  }

  return NextResponse.json({ success: true, event }, { headers: { 'Cache-Control': 'no-store' } })
}
