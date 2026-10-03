import { NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/services/auth.service'
import { getReviewEligibility } from '@/lib/services/reviews.service'

interface RouteProps {
  params: Promise<{ slug: string }>
}

/** Can the signed-in shopper review this product? Guests get NOT_SIGNED_IN. */
export async function GET(request: Request, { params }: RouteProps) {
  try {
    const user = await authenticateRequest(request).catch(() => null)
    if (!user) return NextResponse.json({ success: true, status: 'NOT_SIGNED_IN' }, { headers: { 'Cache-Control': 'no-store' } })
    const { slug } = await params
    const status = await getReviewEligibility(user.id, slug)
    return NextResponse.json({ success: true, status }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[reviews/eligibility]', error)
    return NextResponse.json({ success: false, status: 'NOT_PURCHASED' }, { status: 500 })
  }
}
