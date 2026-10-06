import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { getCodBalanceInfo, listCodOrders } from '@/lib/services/shipping/cod.service'
import { getGeliverConfig } from '@/lib/services/shipping/geliver/geliver.client'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const [orders, balance] = await Promise.all([listCodOrders(), getCodBalanceInfo()])
    return NextResponse.json({ success: true, orders, balance, configured: getGeliverConfig() !== null })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Kapıda ödeme siparişleri alınamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 500 }
    )
  }
}
