import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { PickingService } from '@/lib/services/warehouse/picking.service'

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(request, 'WAREHOUSE_PICK')
    const params = await props.params

    await PickingService.completePicking(params.id, user.id || 'op_current')

    return NextResponse.json({
      success: true,
      message: 'Toplama başarıyla tamamlandı.',
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Toplama tamamlanamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : error.statusCode || 400 }
    )
  }
}
