import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { getAdminReviews, type ReviewStatusType } from '@/lib/services/reviews.service'

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const { searchParams } = new URL(request.url)
    const status = (searchParams.get('status') as ReviewStatusType) || undefined

    const reviews = await getAdminReviews(status)

    return NextResponse.json({
      success: true,
      reviews,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN') || error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Değerlendirmeler listelenemedi.' },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
