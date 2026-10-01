import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { cancelShipmentForOrder } from '@/lib/services/shipping/fulfillment.service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  try {
    const admin = await requireAdmin(request)
    const { orderNumber } = await params
    const body = await request.json().catch(() => ({}))

    const shipment = await cancelShipmentForOrder({
      orderNumber,
      reason: body.reason,
      requestedBy: admin.email,
    })

    return NextResponse.json({
      success: true,
      message: 'Kargo gönderisi iptal edildi.',
      shipment,
    })
  } catch (error: any) {
    console.error('[admin/orders/shipping/cancel] Error:', error)
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Kargo iptal edilemedi.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}
