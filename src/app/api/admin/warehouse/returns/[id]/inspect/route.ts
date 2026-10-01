import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { ReturnInspectionService } from '@/lib/services/warehouse/return-inspection.service'

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(request, 'WAREHOUSE_RETURN_INSPECT')
    const { id } = await props.params
    const body = await request.json()

    if (!body.scannedBarcode || !body.condition || !body.disposition) {
      return NextResponse.json(
        { success: false, error: 'scannedBarcode, condition ve disposition zorunludur.' },
        { status: 400 }
      )
    }

    const result = await ReturnInspectionService.inspectItem({
      inspectionId: id,
      scannedBarcode: body.scannedBarcode,
      condition: body.condition,
      disposition: body.disposition,
      quantity: body.quantity ? Number(body.quantity) : 1,
      targetLocationId: body.targetLocationId,
      notes: body.notes,
      adminUserId: user.name || user.email || 'Admin',
      idempotencyVersion: body.idempotencyVersion || 'v1',
    })

    return NextResponse.json({
      success: true,
      inspectionItem: result.inspectionItem,
      idempotent: result.idempotent,
      message: result.message,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Ürün kontrolü başarısız.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}
