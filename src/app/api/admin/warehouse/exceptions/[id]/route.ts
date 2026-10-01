import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { WarehouseExceptionService } from '@/lib/services/warehouse/exception.service'

export async function PATCH(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(request, 'WAREHOUSE_EXCEPTION')
    const params = await props.params
    const body = await request.json()

    if (!body.resolution) {
      return NextResponse.json(
        { success: false, error: 'Çözüm açıklaması (resolution) zorunludur.' },
        { status: 400 }
      )
    }

    const exception = await WarehouseExceptionService.resolveException({
      exceptionId: params.id,
      resolvedBy: user.name || user.email || 'Admin',
      resolution: body.resolution,
      unblockFulfillment: body.unblockFulfillment !== false,
    })

    return NextResponse.json({
      success: true,
      exception,
      message: 'İstisna başarıyla çözüldü.',
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'İstisna çözülemedi.' },
      { status: isForbidden ? 403 : isAuth ? 401 : error.statusCode || 400 }
    )
  }
}
