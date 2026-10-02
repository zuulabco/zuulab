import { NextResponse } from 'next/server'
import { z } from 'zod'
import { validateCoupon } from '@/lib/services/coupons.service'
import { authenticateRequest } from '@/lib/services/auth.service'
import { cartItemsSchema, shippingMethodSchema } from '@/lib/validations/checkout.schema'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  code: z.string().trim().min(1, 'Kupon kodu girilmelidir.').max(30),
  items: cartItemsSchema,
  shippingMethod: shippingMethodSchema,
})

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Kupon kodu girilmelidir.' },
        { status: 400 }
      )
    }

    const user = await authenticateRequest(request).catch(() => null)
    const result = await validateCoupon({ ...parsed.data, userId: user?.id })

    if (!result.valid) {
      return NextResponse.json({ success: false, error: result.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error('[coupons/validate] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Kupon doğrulanırken hata oluştu.' },
      { status: 500 }
    )
  }
}
