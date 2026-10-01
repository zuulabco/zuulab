import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { moderateReview } from '@/lib/services/reviews.service'
import { z } from 'zod'

const moderateSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  moderationNote: z.string().max(300).optional().nullable(),
})

interface RouteProps {
  params: Promise<{ id: string }>
}

export async function PATCH(request: Request, { params }: RouteProps) {
  try {
    const adminUser = await requireAdmin(request)
    const { id } = await params
    const body = await request.json().catch(() => ({}))

    const parsed = moderateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Geçersiz moderasyon isteği.' },
        { status: 400 }
      )
    }

    const review = await moderateReview(
      adminUser.id,
      id,
      parsed.data.action,
      parsed.data.moderationNote || undefined
    )

    return NextResponse.json({
      success: true,
      message: `Değerlendirme ${parsed.data.action === 'APPROVE' ? 'onaylandı' : 'reddedildi'}.`,
      review,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN') || error.message?.includes('UNAUTHORIZED')
    const isNotFound = error.message?.includes('NOT_FOUND')

    return NextResponse.json(
      { success: false, error: error.message || 'Moderasyon işlemi başarısız.' },
      { status: isForbidden ? 403 : isNotFound ? 404 : 500 }
    )
  }
}
