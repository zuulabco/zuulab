import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { retryPendingMarketplaceOrders } from '@/lib/services/marketplace/marketplace-orders.service'
import { listingErrorResponse } from '../listings/route-error'

/** Retries every package waiting for product links (optionally for one store). */
export async function POST(request: Request) {
  try {
    const user = await requireAdmin(request)
    const body = (await request.json().catch(() => ({}))) as { storeId?: string }
    const result = await retryPendingMarketplaceOrders(body.storeId || undefined, user.id)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return listingErrorResponse(err, 'Bekleyen siparişler yeniden denenemedi.')
  }
}
