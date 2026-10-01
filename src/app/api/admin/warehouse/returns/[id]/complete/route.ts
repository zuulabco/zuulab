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
    const body = await request.json().catch(() => ({}))

    const inspection = await ReturnInspectionService.completeInspection(
      id,
      user.name || user.email || 'Admin',
      body.notes
    )

    return NextResponse.json({
      success: true,
      inspection,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'İnceleme tamamlanamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}
