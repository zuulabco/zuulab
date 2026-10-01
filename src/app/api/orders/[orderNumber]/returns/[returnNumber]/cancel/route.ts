import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/services/auth.service'
import { cancelReturnRequest } from '@/lib/services/returns/returns.service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string; returnNumber: string }> }
) {
  try {
    const user = await requireAuth(request)
    const { returnNumber } = await params
    const body = await request.json().catch(() => ({}))

    const returnRequest = await cancelReturnRequest({
      returnNumber,
      userId: user.id,
      reason: body.reason,
    })

    return NextResponse.json({
      success: true,
      message: 'İade talebiniz iptal edildi.',
      returnRequest,
    })
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'İade talebi iptal edilemedi.' },
      { status: isAuth ? 401 : 400 }
    )
  }
}
