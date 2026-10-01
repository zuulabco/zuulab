import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { WarehouseService } from '@/lib/services/warehouse/warehouse.service'

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'WAREHOUSE_MANAGE')
    const body = await request.json()

    const fulfillment = await WarehouseService.createFulfillment(body)

    return NextResponse.json({
      success: true,
      fulfillment,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Fulfillment kaydı oluşturulamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : error.statusCode || 400 }
    )
  }
}
