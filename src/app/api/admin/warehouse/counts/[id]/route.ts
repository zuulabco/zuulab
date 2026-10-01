import { NextResponse } from 'next/server'
import { requirePermission, hasPermission } from '@/lib/services/permissions.service'
import { CycleCountingService } from '@/lib/services/warehouse/cycle-counting.service'

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(request, 'WAREHOUSE_COUNT_VIEW')
    const { id } = await props.params
    const { searchParams } = new URL(request.url)

    const canManage = hasPermission(user.role, 'WAREHOUSE_COUNT_MANAGE')
    // Operators and staff get blind mode masked view unless manager/admin overrides explicitly
    const forceBlind = searchParams.get('blind') === 'true'
    const maskBlind = forceBlind || !canManage

    const session = await CycleCountingService.getSession(id, { maskBlind })

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Sayım oturumu bulunamadı.' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      session,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Sayım oturumu alınamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 500 }
    )
  }
}
