import { NextResponse } from 'next/server'
import { requireAuth, authenticateRequest } from '@/lib/services/auth.service'
import { verifyAndCalculateCart } from '@/lib/services/products.service'

export async function GET(request: Request) {
  try {
    const user = await requireAuth(request)
    // In Phase 5, return user cart structure
    return NextResponse.json({
      success: true,
      cart: {
        userId: user.id,
        items: [],
        subtotal: 0,
        shipping: 0,
        total: 0,
      },
    })
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Sepet bilgisi alınamadı.' },
      { status: isAuth ? 401 : 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    // If authenticated, associate with user; otherwise allow guest cart calculation
    const user = await authenticateRequest(request)
    const body = await request.json().catch(() => ({}))
    const { items, couponCode } = body

    if (!Array.isArray(items)) {
      return NextResponse.json(
        { success: false, error: 'Sepet öğeleri (items) geçerli bir liste olmalıdır.' },
        { status: 400 }
      )
    }

    // Server-side authoritative validation and recalculation
    const calculation = await verifyAndCalculateCart(items, couponCode)

    return NextResponse.json({
      success: true,
      userId: user?.id || null,
      ...calculation,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Sepet güncellenemedi.' },
      { status: 500 }
    )
  }
}
