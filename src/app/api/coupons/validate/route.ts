import { NextResponse } from 'next/server'
import { validateCoupon } from '@/lib/services/coupons.service'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const { code, subtotal } = body

    if (!code) {
      return NextResponse.json(
        { success: false, error: 'Kupon kodu girilmelidir.' },
        { status: 400 }
      )
    }

    const result = await validateCoupon(String(code), Number(subtotal || 0))

    if (!result.valid) {
      return NextResponse.json(
        { success: false, error: result.message },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: 'Kupon doğrulanırken hata oluştu.' },
      { status: 500 }
    )
  }
}
