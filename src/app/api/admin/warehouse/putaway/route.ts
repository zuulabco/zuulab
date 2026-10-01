import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { PutawayService } from '@/lib/services/warehouse/putaway.service'

export async function GET(request: Request) {
  try {
    await requirePermission(request, 'WAREHOUSE_LOCATION_VIEW')
    const { searchParams } = new URL(request.url)

    const productId = searchParams.get('productId')
    const sku = searchParams.get('sku') || ''
    const quantity = parseInt(searchParams.get('quantity') || '1', 10)
    const warehouseId = searchParams.get('warehouseId') || 'MAIN'

    if (!productId) {
      return NextResponse.json(
        { success: false, error: 'productId parametresi zorunludur.' },
        { status: 400 }
      )
    }

    const suggestions = await PutawayService.scoreLocationsForProduct({
      productId,
      sku: sku || productId,
      quantity,
      warehouseId,
    })

    return NextResponse.json({
      success: true,
      count: suggestions.length,
      suggestions,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Lokasyon önerileri alınamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'WAREHOUSE_LOCATION_MANAGE')
    const body = await request.json()

    if (!body.locationId || !body.productId || !body.quantity) {
      return NextResponse.json(
        { success: false, error: 'locationId, productId ve quantity zorunludur.' },
        { status: 400 }
      )
    }

    const result = await PutawayService.executePutaway({
      warehouseId: body.warehouseId || 'MAIN',
      locationId: body.locationId,
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
      { success: false, error: error.message || 'Yerleştirme işlemi başarısız.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}
