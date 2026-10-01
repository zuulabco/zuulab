import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { CycleCountingService } from '@/lib/services/warehouse/cycle-counting.service'

export async function GET(request: Request) {
  try {
    const user = await requirePermission(request, 'WAREHOUSE_COUNT_VIEW')
    const { searchParams } = new URL(request.url)

    const status = (searchParams.get('status') as any) || undefined
    const warehouseId = searchParams.get('warehouseId') || undefined
    const storeId = searchParams.get('storeId') || undefined

    const sessions = await CycleCountingService.listSessions({
      status,
      warehouseId,
      storeId,
    })

    return NextResponse.json({
      success: true,
      count: sessions.length,
      sessions,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Sayım oturumları listelenemedi.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'WAREHOUSE_COUNT_MANAGE')
    const body = await request.json()

    const session = await CycleCountingService.createSession({
      warehouseId: body.warehouseId || 'MAIN',
      storeId: body.storeId || null,
      type: body.type || 'LOCATION',
      blindMode: body.blindMode !== undefined ? body.blindMode : true,
      assignedTo: body.assignedTo || null,
      locationIds: body.locationIds,
      productIds: body.productIds,
      notes: body.notes,
      createdBy: user.name || user.email || 'Admin',
      idempotencyKey: body.idempotencyKey,
    })

    return NextResponse.json({
      success: true,
      session,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Sayım oturumu oluşturulamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 500 }
    )
  }
}
