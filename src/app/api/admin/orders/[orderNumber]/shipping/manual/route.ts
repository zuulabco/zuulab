import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { recordManualShipment } from '@/lib/services/shipping/fulfillment.service'

/** Sürat Kargo: the admin enters the tracking number of a parcel handed in */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  try {
    const admin = await requireAdmin(request)
    const { orderNumber } = await params
    const body = await request.json().catch(() => ({}))

    const shipment = await recordManualShipment({
      orderNumber,
      trackingNumber: String(body.trackingNumber || ''),
      requestedBy: admin.email,
    })

    return NextResponse.json({ success: true, message: 'Sipariş kargoya verildi olarak kaydedildi.', shipment })
  } catch (error: any) {
    console.error('[admin/orders/shipping/manual] Error:', error)
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Kargo bilgisi kaydedilemedi.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}
