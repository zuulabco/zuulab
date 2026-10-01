import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/services/auth.service'
import { getReturnRequestByNumber } from '@/lib/services/returns/returns.service'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string; returnNumber: string }> }
) {
  try {
    const user = await requireAuth(request)
    const { returnNumber } = await params

    const returnRequest = await getReturnRequestByNumber(returnNumber, user.id)
    if (!returnRequest) {
      return NextResponse.json(
        { success: false, error: 'İade talebi bulunamadı.' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      returnRequest,
    })
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'İade talebi alınamadı.' },
      { status: isAuth ? 401 : 403 }
    )
  }
}
