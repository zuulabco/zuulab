import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { WarehouseService } from '@/lib/services/warehouse/warehouse.service'

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission(request, 'WAREHOUSE_VIEW')
    const params = await props.params
    const fulfillment = await WarehouseService.getFulfillment(params.id)

    return NextResponse.json({
      success: true,
      fulfillment,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Fulfillment bulunamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : error.statusCode || 404 }
    )
  }
}
