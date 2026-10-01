import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { receiveReturnPackage } from '@/lib/services/returns/returns.service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ returnNumber: string }> }
) {
  try {
    const admin = await requireAdmin(request)
    const { returnNumber } = await params
    const body = await request.json().catch(() => ({}))

    const returnRequest = await receiveReturnPackage({
      returnNumber,
      adminUserId: admin.email,
      note: body.note,
    })

    return NextResponse.json({
      success: true,
      message: 'İade paketi teslim alındı olarak işaretlendi.',
      returnRequest,
    })
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Paket teslim alınamadı.' },
      { status: isAuth ? 401 : 400 }
    )
  }
}
