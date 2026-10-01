import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { CycleCountingService } from '@/lib/services/warehouse/cycle-counting.service'

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(request, 'WAREHOUSE_COUNT_RECONCILE')
    const { id } = await props.params
    const body = await request.json()

    if (!body.ticketId) {
      return NextResponse.json(
        { success: false, error: 'Uzlaştırılacak bilet (ticketId) belirtilmelidir.' },
        { status: 400 }
      )
    }

    const result = await CycleCountingService.reconcileTicket(
      body.ticketId,
      user.name || user.email || 'Admin'
    )

    return NextResponse.json({
      success: true,
      ticket: result.ticket,
      adjustment: result.adjustment,
      idempotent: result.idempotent,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Uzlaştırma işlemi uygulanamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}
