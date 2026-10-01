import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { getTrackingInfo } from '@/lib/services/shipping/fulfillment.service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  try {
    await requireAdmin(request)
    const { orderNumber } = await params

    const trackingData = await getTrackingInfo({
      orderNumber,
      isAdmin: true,
    })

    return NextResponse.json({
      success: true,
      message: 'Kargo durumu başarıyla güncellendi.',
      shipment: trackingData.shipment,
      tracking: trackingData.tracking,
    })
  } catch (error: any) {
    console.error('[admin/orders/shipping/sync] Error:', error)
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Kargo takibi güncellenemedi.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}
