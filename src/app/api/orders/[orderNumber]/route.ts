import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/security/rate-limit-response'
import { authenticateRequest } from '@/lib/services/auth.service'
import { getOrderByNumber, isInternalHistoryItem } from '@/lib/services/orders.service'

interface Context {
  params: Promise<{ orderNumber: string }>
}

export async function GET(request: Request, { params }: Context) {
  const limited = await rateLimit(request, 'orderLookup')
  if (limited) return limited

  try {
    const { orderNumber } = await params
    const user = await authenticateRequest(request)
    const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'

    const { searchParams } = new URL(request.url)
    const guestEmail = searchParams.get('email')?.trim().toLowerCase()

    const order = await getOrderByNumber(orderNumber, user?.id, isAdmin)

    if (!order) {
      return NextResponse.json(
        { success: false, error: 'Sipariş bulunamadı veya bu siparişi görüntüleme yetkiniz yok.' },
        { status: 404 }
      )
    }

    // Security check: Customer ownership verification (IDOR protection)
    if (!isAdmin) {
      if (user) {
        const isOwner =
          order.userId === user.id ||
          (user.email && order.customerEmail?.toLowerCase() === user.email.toLowerCase()) ||
          (user.email && order.shippingAddressSnapshot?.email?.toLowerCase() === user.email.toLowerCase())

        if (!isOwner) {
          return NextResponse.json(
            { success: false, error: 'Bu siparişi görüntüleme yetkiniz bulunmamaktadır.' },
            { status: 403 }
          )
        }
      } else {
        // Guest user must provide the email matching the order
        const orderEmail = (order.customerEmail || order.shippingAddressSnapshot?.email || '').toLowerCase()
        if (!guestEmail || guestEmail !== orderEmail) {
          return NextResponse.json(
            { success: false, error: 'Siparişi görüntülemek için geçerli müşteri e-posta adresi gereklidir.' },
            { status: 401 }
          )
        }
      }
    }

    // Sanitize order output: customer should never see internal cost prices or admin notes
    const sanitized = {
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      createdAt: order.createdAt,
      subtotal: order.subtotal,
      discountAmount: order.discountAmount,
      shippingAmount: order.shippingAmount,
      shippingMethod: order.shippingMethod,
      taxAmount: order.taxAmount,
      totalAmount: order.totalAmount,
      couponCode: order.couponCode,
      shippingAddress: order.shippingAddressSnapshot,
      billingAddress: order.billingAddressSnapshot,
      items: order.items.map((i: any) => ({
        productId: i.productId,
        productName: i.productName,
        sku: i.sku,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        totalAmount: i.totalAmount,
        imageUrl: i.imageUrl,
      })),
      statusHistory: order.statusHistory.filter((h: any) => !isInternalHistoryItem(h)).map((h: any) => ({
        id: h.id,
        status: h.status,
        note: h.note,
        createdAt: h.createdAt,
      })),
    }

    return NextResponse.json({
      success: true,
      order: sanitized,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Sipariş yüklenemedi.' },
      { status: 500 }
    )
  }
}
