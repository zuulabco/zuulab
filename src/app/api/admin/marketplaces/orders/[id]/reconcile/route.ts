import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import {
  getMarketplaceOrderView,
  retryPendingMarketplaceOrders,
} from '@/lib/services/marketplace/marketplace-orders.service'
import { listingErrorResponse } from '../../../listings/route-error'

/** Tries again to create the site order of a package that was waiting for product links. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAdmin(request)
    const { id } = await params
    const before = await getMarketplaceOrderView(id)
    if (!before) return NextResponse.json({ success: false, error: 'Sipariş bulunamadı.' }, { status: 404 })
    await retryPendingMarketplaceOrders(before.storeId, user.id)
    return NextResponse.json({ success: true, order: await getMarketplaceOrderView(id) })
  } catch (err) {
    return listingErrorResponse(err, 'Sipariş yeniden denenemedi.')
  }
}
