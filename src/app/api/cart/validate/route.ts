import { NextResponse } from 'next/server'
import { verifyAndCalculateCart } from '@/lib/services/products.service'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const { items, couponCode } = body

    if (!Array.isArray(items)) {
      return NextResponse.json(
        { success: false, error: 'Sepet öğeleri (items) dizi olmalıdır.' },
        { status: 400 }
      )
    }

    // Authoritative server-side price recalculation
    const verified = await verifyAndCalculateCart(items, couponCode)

    return NextResponse.json({
      success: true,
      data: verified,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Sepet hesaplanamadı.' },
      { status: 500 }
    )
  }
}
