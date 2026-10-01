import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { inspectReturnItems } from '@/lib/services/returns/returns.service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ returnNumber: string }> }
) {
  try {
    const admin = await requireAdmin(request)
    const { returnNumber } = await params
    const body = await request.json().catch(() => ({}))

    if (!body.itemResolutions || !Array.isArray(body.itemResolutions)) {
      return NextResponse.json(
        { success: false, error: 'Ürün inceleme kararları (itemResolutions) gereklidir.' },
        { status: 400 }
      )
    }

    const returnRequest = await inspectReturnItems({
      returnNumber,
      itemResolutions: body.itemResolutions,
      adminUserId: admin.email,
    })

    return NextResponse.json({
      success: true,
      message: 'İnceleme sonuçları ve stok kararları kaydedildi.',
      returnRequest,
    })
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'İnceleme kaydedilemedi.' },
      { status: isAuth ? 401 : 400 }
    )
  }
}
