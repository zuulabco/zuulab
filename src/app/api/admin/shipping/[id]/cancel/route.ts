import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { ShippingService } from '@/lib/services/shipping/shipping.service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission(request, 'SHIPPING_CANCEL')
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const reason = body.reason || 'Yönetici tarafından kargo iptal edildi.'

    const updated = await ShippingService.cancelShipment(id, reason)

    return NextResponse.json({
      success: true,
      message: 'Kargo gönderisi başarıyla iptal edildi.',
      shipment: updated,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message || 'Kargo iptal edilemedi.' },
      { status: isForbidden ? 403 : 400 }
    )
  }
}
