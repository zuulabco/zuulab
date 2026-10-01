import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { LocationService } from '@/lib/services/warehouse/location.service'
import { PutawayService } from '@/lib/services/warehouse/putaway.service'

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'WAREHOUSE_LOCATION_MANAGE')
    const body = await request.json()

    if (!body.sourceLocationId || !body.destinationLocationId || !body.productId || !body.quantity) {
      return NextResponse.json(
        {
          success: false,
          error: 'sourceLocationId, destinationLocationId, productId ve quantity zorunludur.',
        },
        { status: 400 }
      )
    }

    const result = await PutawayService.executeRelocation({
      warehouseId: body.warehouseId || 'MAIN',
      sourceLocationId: body.sourceLocationId,
      destinationLocationId: body.destinationLocationId,
      productId: body.productId,
      sku: body.sku || body.productId,
      quantity: Number(body.quantity),
      operatorId: user.name || user.email || 'Admin',
      referenceId: body.referenceId,
      idempotencyKey: body.idempotencyKey,
      notes: body.notes,
    })

    return NextResponse.json({
      success: true,
      movement: result.movement,
      idempotent: result.idempotent,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Lokasyon transferi başarısız.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}
