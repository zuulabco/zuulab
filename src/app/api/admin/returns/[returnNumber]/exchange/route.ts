import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { processExchangeForReturn } from '@/lib/services/returns/returns.service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ returnNumber: string }> }
) {
  try {
    const admin = await requireAdmin(request)
    const { returnNumber } = await params
    const body = await request.json().catch(() => ({}))

    const returnRequest = await processExchangeForReturn({
      returnNumber,
      replacementSku: body.replacementSku,
      adminUserId: admin.email,
    })

    return NextResponse.json({
      success: true,
      message: 'Değişim işlemi başarıyla tamamlandı.',
      returnRequest,
    })
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Değişim gerçekleştirilemedi.' },
      { status: isAuth ? 401 : 400 }
    )
  }
}
