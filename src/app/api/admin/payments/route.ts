import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { getAllPayments } from '@/lib/services/payment/payment.service'

export async function GET(request: Request) {
  try {
    await requireAdmin(request)

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || undefined
    const provider = searchParams.get('provider') || undefined
    const search = searchParams.get('search') || undefined
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 50

    const payments = await getAllPayments({
      status,
      provider,
      search,
      limit,
    })

    return NextResponse.json({
      success: true,
      total: payments.length,
      payments,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Ödeme kayıtları alınamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 500 }
    )
  }
}
