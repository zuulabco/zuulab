import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import {
  createShipmentForOrder,
  getShipmentByOrderNumber,
  getTrackingInfo,
} from '@/lib/services/shipping/fulfillment.service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  try {
    const admin = await requireAdmin(request)
    const { orderNumber } = await params
    const body = await request.json().catch(() => ({}))

    const shipment = await createShipmentForOrder({
      orderNumber,
      packageCount: body.packageCount,
      totalWeightKg: body.totalWeightKg,
      notes: body.notes,
      requestedBy: admin.email,
    })

    return NextResponse.json({
      success: true,
      message: 'Kargo sevk kaydı oluşturuldu.',
      shipment,
    })
  } catch (error: any) {
    console.error('[admin/orders/shipping] Error:', error)
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Kargo kaydı oluşturulamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  try {
    await requireAdmin(request)
    const { orderNumber } = await params

    const shipment = await getShipmentByOrderNumber(orderNumber)
    if (!shipment) {
      return NextResponse.json({
        success: true,
        hasShipment: false,
        shipment: null,
      })
    }

    const trackingData = await getTrackingInfo({ orderNumber, isAdmin: true }).catch(() => null)

    return NextResponse.json({
      success: true,
      hasShipment: true,
      shipment: trackingData?.shipment || shipment,
      tracking: trackingData?.tracking || null,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Kargo bilgisi alınamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 500 }
    )
  }
}
