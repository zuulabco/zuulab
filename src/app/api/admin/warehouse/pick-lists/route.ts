import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { PickingService } from '@/lib/services/warehouse/picking.service'

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'WAREHOUSE_PICK')
    const body = await request.json()

    if (!body.fulfillmentIds || !Array.isArray(body.fulfillmentIds) || body.fulfillmentIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'En az bir sipariş (fulfillmentId) seçilmelidir.' },
        { status: 400 }
      )
    }

    const result = await PickingService.createPickList(
      body.fulfillmentIds,
      body.assignedOperatorId || user.id || 'op_current'
    )

    return NextResponse.json({
      success: true,
      pickList: result.pickList,
      consolidatedItems: result.consolidatedItems,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Pick listesi oluşturulamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : error.statusCode || 400 }
    )
  }
}
