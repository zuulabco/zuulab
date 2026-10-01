import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { ShippingService } from '@/lib/services/shipping/shipping.service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission(request, 'SHIPPING_MANAGE')
    const { id } = await params

    const updated = await ShippingService.syncTracking(id)

    return NextResponse.json({
      success: true,
      message: 'Kargo takip durumu güncellendi.',
      shipment: updated,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message || 'Kargo takip güncellenemedi.' },
      { status: isForbidden ? 403 : 400 }
    )
  }
}
