import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { CycleCountingService } from '@/lib/services/warehouse/cycle-counting.service'

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(request, 'WAREHOUSE_COUNT_MANAGE')
    const { id } = await props.params
    const body = await request.json()

    if (!body.lineId) {
      return NextResponse.json(
        { success: false, error: 'Yeniden sayılacak satır (lineId) belirtilmelidir.' },
        { status: 400 }
      )
    }

    const line = await CycleCountingService.requestRecount(
      id,
      body.lineId,
      user.name || user.email || 'Admin',
      body.notes
    )

    return NextResponse.json({
      success: true,
      line,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Yeniden sayım talebi oluşturulamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}
