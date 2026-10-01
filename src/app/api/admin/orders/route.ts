import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { getAllOrders } from '@/lib/services/orders.service'

export async function GET(request: Request) {
  try {
    await requireAdmin(request)

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || undefined
    const paymentStatus = searchParams.get('paymentStatus') || undefined
    const channel = searchParams.get('channel') || undefined
    const search = searchParams.get('search') || undefined
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 50
    const offset = searchParams.get('offset') ? Number(searchParams.get('offset')) : 0

    const allOrders = await getAllOrders({
      status,
      paymentStatus,
      channel,
      search,
    })

    const total = allOrders.length
    const orders = allOrders.slice(offset, offset + limit)

    return NextResponse.json({
      success: true,
      total,
      orders,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Yönetici siparişleri alınamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 500 }
    )
  }
}
