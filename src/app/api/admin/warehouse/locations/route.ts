import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { LocationService } from '@/lib/services/warehouse/location.service'

export async function GET(request: Request) {
  try {
    await requirePermission(request, 'WAREHOUSE_LOCATION_VIEW')
    const { searchParams } = new URL(request.url)

    const warehouseId = searchParams.get('warehouseId') || undefined
    const type = (searchParams.get('type') as any) || undefined
    const zone = searchParams.get('zone') || undefined
    const isActive = searchParams.get('isActive') !== null ? searchParams.get('isActive') === 'true' : undefined

    const locations = await LocationService.listLocations({
      warehouseId,
      type,
      zone,
      isActive,
    })

    return NextResponse.json({
      success: true,
      count: locations.length,
      locations,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Lokasyonlar listelenemedi.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'WAREHOUSE_LOCATION_MANAGE')
    const body = await request.json()

    if (!body.code || !body.name || !body.type) {
      return NextResponse.json(
        { success: false, error: 'Lokasyon kodu, adı ve tipi (type) zorunludur.' },
        { status: 400 }
      )
    }

    const location = await LocationService.createLocation({
      warehouseId: body.warehouseId || 'MAIN',
      parentId: body.parentId || null,
      code: body.code,
      name: body.name,
      type: body.type,
      zone: body.zone || null,
      aisle: body.aisle || null,
      rack: body.rack || null,
      shelf: body.shelf || null,
      bin: body.bin || null,
      capacity: body.capacity !== undefined ? Number(body.capacity) : 100,
      weightCapacityGrams: body.weightCapacityGrams ? Number(body.weightCapacityGrams) : null,
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
      isPickable: body.isPickable !== undefined ? Boolean(body.isPickable) : true,
      isPutawayAllowed: body.isPutawayAllowed !== undefined ? Boolean(body.isPutawayAllowed) : true,
      sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : 0,
      metadata: body.metadata || null,
    })

    return NextResponse.json({
      success: true,
      location,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Lokasyon oluşturulamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}
