import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { createReturnShipmentForReturn } from '@/lib/services/returns/returns.service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ returnNumber: string }> }
) {
  try {
    const admin = await requireAdmin(request)
    const { returnNumber } = await params
    const body = await request.json().catch(() => ({}))

    const shipment = await createReturnShipmentForReturn({
      returnNumber,
      provider: body.provider,
      adminUserId: admin.email,
    })

    return NextResponse.json({
      success: true,
      message: 'İade kargo barkodu ve takip kaydı oluşturuldu.',
      shipment,
    })
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'İade kargo kaydı oluşturulamadı.' },
      { status: isAuth ? 401 : 400 }
    )
  }
}
