import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { approveReturnRequest } from '@/lib/services/returns/returns.service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ returnNumber: string }> }
) {
  try {
    const admin = await requireAdmin(request)
    const { returnNumber } = await params
    const body = await request.json().catch(() => ({}))

    const returnRequest = await approveReturnRequest({
      returnNumber,
      adminUserId: admin.email,
      note: body.note,
      autoGenerateShipping: body.autoGenerateShipping !== false,
      provider: body.provider,
    })

    return NextResponse.json({
      success: true,
      message: 'İade talebi onaylandı.',
      returnRequest,
    })
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'İade talebi onaylanamadı.' },
      { status: isAuth ? 401 : 400 }
    )
  }
}
