import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { getAdminTickets, type TicketStatusType, type TicketCategoryType } from '@/lib/services/support.service'

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const { searchParams } = new URL(request.url)
    const status = (searchParams.get('status') as TicketStatusType) || undefined
    const category = (searchParams.get('category') as TicketCategoryType) || undefined
    const search = searchParams.get('search') || undefined

    const tickets = await getAdminTickets({ status, category, search })

    return NextResponse.json({
      success: true,
      tickets,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN') || error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Destek talepleri listelenemedi.' },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
