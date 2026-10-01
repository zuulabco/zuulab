import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/services/auth.service'
import {
  createReturnRequest,
  getReturnsByOrderNumber,
} from '@/lib/services/returns/returns.service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  try {
    const user = await requireAuth(request)
    const { orderNumber } = await params
    const body = await request.json().catch(() => ({}))

    const returnRequest = await createReturnRequest({
      orderNumber,
      userId: user.id,
      type: body.type || 'RETURN',
      reason: body.reason,
      customerNote: body.customerNote,
      items: body.items || [],
      photos: body.photos || [],
    })

    return NextResponse.json({
      success: true,
      message: 'İade/değişim talebiniz başarıyla alındı.',
      returnRequest,
    })
  } catch (error: any) {
    console.error('[api/orders/returns] Error:', error)
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'İade talebi oluşturulamadı.' },
      { status: isAuth ? 401 : 400 }
    )
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  try {
    const user = await requireAuth(request)
    const { orderNumber } = await params

    const returns = await getReturnsByOrderNumber(orderNumber, user.id)

    return NextResponse.json({
      success: true,
      returns,
    })
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'İade talepleri alınamadı.' },
      { status: isAuth ? 401 : 500 }
    )
  }
}
