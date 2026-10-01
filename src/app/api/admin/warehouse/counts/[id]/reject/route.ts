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

    if (!body.ticketId) {
      return NextResponse.json(
        { success: false, error: 'Reddedilecek uzlaştırma bileti (ticketId) belirtilmelidir.' },
        { status: 400 }
      )
    }

    const ticket = await CycleCountingService.rejectTicket(
      body.ticketId,
      user.name || user.email || 'Admin',
      body.reason || 'Fark reddedildi.'
    )

    return NextResponse.json({
      success: true,
      ticket,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Uzlaştırma bileti reddedilemedi.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}
