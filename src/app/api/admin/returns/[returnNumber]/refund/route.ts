import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { processRefundForReturn } from '@/lib/services/returns/returns.service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ returnNumber: string }> }
) {
  try {
    const admin = await requireAdmin(request)
    const { returnNumber } = await params

    const returnRequest = await processRefundForReturn({
      returnNumber,
      adminUserId: admin.email,
    })

    return NextResponse.json({
      success: true,
      message: 'Müşteri para iadesi başarıyla tamamlandı.',
      returnRequest,
    })
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Para iadesi gerçekleştirilemedi.' },
      { status: isAuth ? 401 : 400 }
    )
  }
}
