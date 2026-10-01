import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/services/auth.service'
import { getUserOrders } from '@/lib/services/orders.service'

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
      { success: false, error: error.message || 'Siparişler alınamadı.' },
      { status: isAuth ? 401 : 500 }
    )
  }
}
