import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/services/auth.service'
import { createOrder, getUserOrders } from '@/lib/services/orders.service'
import { logAuditEvent } from '@/lib/services/admin.service'

export async function GET(request: Request) {
  try {
    const user = await requireAuth(request)
    const orders = await getUserOrders(user.id)

    return NextResponse.json({
      success: true,
      orders,
    })
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Siparişler listelenemedi.' },
      { status: isAuth ? 401 : 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth(request)
    const body = await request.json().catch(() => ({}))

    const { items, couponCode, shippingAddress, customerNote } = body

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Sipariş için en az bir ürün gereklidir.' },
        { status: 400 }
      )
    }

    if (
      !shippingAddress ||
      !shippingAddress.fullName ||
      !shippingAddress.phone ||
      !shippingAddress.addressLine ||
      !shippingAddress.city
    ) {
      return NextResponse.json(
        { success: false, error: 'Teslimat adresi bilgileri eksik.' },
        { status: 400 }
      )
    }

    // Authoritative order creation with server-side price check
    const order = await createOrder({
      userId: user.id,
      items,
      couponCode,
      shippingAddress,
      customerNote,
    })

    // Log audit event
    await logAuditEvent({
      userId: user.id,
      action: 'ORDER_CREATED',
      entity: 'Order',
      entityId: order.orderNumber,
      metadata: {
        total: order.totalAmount,
        itemCount: order.items.length,
      },
    })

    return NextResponse.json({
      success: true,
      order,
    })
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Sipariş oluşturulamadı.' },
      { status: isAuth ? 401 : 500 }
    )
  }
}
