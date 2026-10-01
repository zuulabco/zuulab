import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { LocationService } from '@/lib/services/warehouse/location.service'

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission(request, 'WAREHOUSE_LOCATION_VIEW')
    const { id } = await props.params

    const location = await LocationService.getLocation(id)
    const inventory = await LocationService.getLocationInventory(id)

    return NextResponse.json({
      success: true,
      location,
      inventory,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Lokasyon bulunamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 404 }
    )
  }
}

export async function PUT(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission(request, 'WAREHOUSE_LOCATION_MANAGE')
    const { id } = await props.params
    const body = await request.json()

    const updated = await LocationService.updateLocation(id, body)

    return NextResponse.json({
      success: true,
      location: updated,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Lokasyon güncellenemedi.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}
