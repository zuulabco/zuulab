import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { getReturnRequestByNumber } from '@/lib/services/returns/returns.service'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ returnNumber: string }> }
) {
  try {
    await requireAdmin(request)
    const { returnNumber } = await params

    const returnRequest = await getReturnRequestByNumber(returnNumber)
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
      { success: false, error: error.message || 'İade detayı alınamadı.' },
      { status: isAuth ? 401 : 403 }
    )
  }
}
