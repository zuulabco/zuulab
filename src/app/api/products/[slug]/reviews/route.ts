import { NextResponse } from 'next/server'
import { getProductReviews, createProductReview } from '@/lib/services/reviews.service'
import { requireAuth } from '@/lib/services/auth.service'
import { z } from 'zod'

const reviewPostSchema = z.object({
  rating: z.number().int().min(1, 'Puan 1 ile 5 arasında olmalıdır.').max(5),
  title: z.string().max(100).optional().nullable(),
  body: z.string().min(5, 'Yorum en az 5 karakter olmalıdır.').max(1000, 'Yorum çok uzun.'),
})

interface RouteProps {
  params: Promise<{ slug: string }>
}

export async function GET(request: Request, { params }: RouteProps) {
  try {
    const { slug } = await params
    const { reviews, stats } = await getProductReviews(slug)

    return NextResponse.json({
      success: true,
      reviews,
      stats,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Yorumlar yüklenemedi.' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const user = await requireAuth(request)
    const { slug } = await params
    const body = await request.json().catch(() => ({}))

    const parsed = reviewPostSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Geçersiz yorum verisi.' },
        { status: 400 }
      )
    }

    const review = await createProductReview(user, {
      productIdOrSlug: slug,
      rating: parsed.data.rating,
      title: parsed.data.title,
      body: parsed.data.body,
    })

    return NextResponse.json(
      {
        success: true,
        message: 'Değerlendirmeniz başarıyla alındı. Yönetici onayının ardından yayınlanacaktır.',
        review,
      },
      { status: 201 }
    )
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    const isDuplicate = error.message?.includes('DUPLICATE_REVIEW')
    const isNotEligible = error.message?.includes('NOT_ELIGIBLE')
    const isNotFound = error.message?.includes('NOT_FOUND')

    const status = isAuth ? 401 : isNotEligible ? 403 : isNotFound ? 404 : isDuplicate ? 409 : 400

    return NextResponse.json(
      { success: false, error: error.message || 'Yorum gönderilemedi.' },
      { status }
    )
  }
}
