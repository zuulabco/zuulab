import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { getMarketplaceOrderView } from '@/lib/services/marketplace/marketplace-orders.service'
import { listingErrorResponse } from '../../listings/route-error'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request)
    const { id } = await params
    const order = await getMarketplaceOrderView(id)
    if (!order) return NextResponse.json({ success: false, error: 'Sipariş bulunamadı.' }, { status: 404 })
    return NextResponse.json({ success: true, order })
  } catch (err) {
    return listingErrorResponse(err, 'Sipariş detayları alınamadı.')
  }
}
