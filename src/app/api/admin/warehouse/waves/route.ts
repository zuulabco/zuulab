import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { WavePickingService } from '@/lib/services/warehouse/wave-picking.service'

export async function GET(request: Request) {
  try {
    await requirePermission(request, 'WAREHOUSE_WAVE_VIEW')
    const { searchParams } = new URL(request.url)

    const status = (searchParams.get('status') as any) || undefined
    const warehouseId = searchParams.get('warehouseId') || undefined

    const waves = await WavePickingService.listWaves({ status, warehouseId })

    return NextResponse.json({
      success: true,
      count: waves.length,
      waves,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Toplama dalgaları listelenemedi.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'WAREHOUSE_WAVE_MANAGE')
    const body = await request.json()

    if (!body.fulfillmentIds || !Array.isArray(body.fulfillmentIds) || body.fulfillmentIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Dalga oluşturmak için en az bir sipariş (fulfillmentIds) seçilmelidir.' },
        { status: 400 }
      )
    }

    const result = await WavePickingService.createWave({
      warehouseId: body.warehouseId || 'MAIN',
      fulfillmentIds: body.fulfillmentIds,
      assignedOperatorId: body.assignedOperatorId || user.name || user.email || 'Admin',
      notes: body.notes,
      prioritizeApproachingCutoffs: body.prioritizeApproachingCutoffs ?? true,
    })

    return NextResponse.json({
      success: true,
      wave: result.wave,
      items: result.items,
      route: result.route,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Dalga oluşturulamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}
