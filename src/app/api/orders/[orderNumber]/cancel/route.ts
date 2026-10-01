import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/services/auth.service'
import { getOrderByNumber, updateOrderStatus } from '@/lib/services/orders.service'

interface Context {
  params: Promise<{ orderNumber: string }>
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { orderNumber } = await params
    const user = await requireAuth(request)
    const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'

    const order = await getOrderByNumber(orderNumber, user.id, isAdmin)
    if (!order) {
      return NextResponse.json(
        { success: false, error: 'Sipariş bulunamadı veya iptal yetkiniz yok.' },
        { status: 404 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const reason = body.reason || 'Kullanıcı talebiyle iptal edildi.'

    const result = await updateOrderStatus(
      orderNumber,
      'CANCELLED',
      reason,
      isAdmin ? `admin:${user.email}` : `customer:${user.email}`
    )

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: 'Sipariş başarıyla iptal edildi ve rezerve stok serbest bırakıldı.',
      order: result.order,
    })
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Sipariş iptal edilemedi.' },
      { status: isAuth ? 401 : 500 }
    )
  }
}
