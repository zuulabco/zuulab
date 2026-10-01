import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { rejectReturnRequest } from '@/lib/services/returns/returns.service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ returnNumber: string }> }
) {
  try {
    const admin = await requireAdmin(request)
    const { returnNumber } = await params
    const body = await request.json().catch(() => ({}))

    if (!body.reason || !body.reason.trim()) {
      return NextResponse.json(
        { success: false, error: 'İade reddi için geçerli bir gerekçe belirtilmelidir.' },
        { status: 400 }
      )
    }

    const returnRequest = await rejectReturnRequest({
      returnNumber,
      reason: body.reason,
      adminUserId: admin.email,
    })

    return NextResponse.json({
      success: true,
      message: 'İade talebi reddedildi.',
      returnRequest,
    })
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'İade talebi reddedilemedi.' },
      { status: isAuth ? 401 : 400 }
    )
  }
}
