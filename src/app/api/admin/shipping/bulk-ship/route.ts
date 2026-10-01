import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { BulkShippingService } from '@/lib/services/shipping/bulk-shipping.service'

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'SHIPPING_MANAGE')
    const body = await request.json()
    const shipmentIds: string[] = body.shipmentIds || []

    if (!Array.isArray(shipmentIds) || shipmentIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'En az bir gönderi kimliği (shipmentIds) belirtilmelidir.' },
        { status: 400 }
      )
    }

    const result = await BulkShippingService.bulkMarkAsShipped({
      shipmentIds,
      storeId: (user as any).storeId || null,
      adminUserId: user.id,
    })

    return NextResponse.json(result)
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Toplu kargo sevk işlemi gerçekleştirilemedi.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}
