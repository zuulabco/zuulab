import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { getNotificationsForOrder } from '@/lib/services/notification/notification.service'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  try {
    await requireAdmin(request)
    const { orderNumber } = await params

    const notifications = await getNotificationsForOrder(orderNumber)

    return NextResponse.json({
      success: true,
      count: notifications.length,
      notifications,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Sipariş bildirimleri alınamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 500 }
    )
  }
}
