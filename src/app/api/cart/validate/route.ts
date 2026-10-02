import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/security/rate-limit-response'
import { cartQuoteSchema } from '@/lib/validations/checkout.schema'
import { quoteCart } from '@/lib/services/checkout/pricing.service'
import { authenticateRequest } from '@/lib/services/auth.service'

export const dynamic = 'force-dynamic'

/**
 * Authoritative cart quote. The cart and checkout pages render these numbers and
 * send `total` back as `expectedTotal`, so what the customer sees is exactly what
 * the order and the PayTR session will charge.
 */
export async function POST(request: Request) {
  const limited = await rateLimit(request, 'cartQuote')
  if (limited) return limited

  try {
    const parsed = cartQuoteSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Geçersiz sepet.' },
        { status: 400 }
      )
    }

    const user = await authenticateRequest(request).catch(() => null)
    const quote = await quoteCart({ ...parsed.data, userId: user?.id })

    return NextResponse.json({ success: true, data: quote })
  } catch (error) {
    console.error('[cart/validate] Quote failed:', error)
    return NextResponse.json({ success: false, error: 'Sepet hesaplanamadı.' }, { status: 500 })
  }
}
