import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { listMarketplaceOrders } from '@/lib/services/marketplace/marketplace-orders.service'
import { listingErrorResponse } from '../listings/route-error'

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const { searchParams } = new URL(request.url)
    const state = searchParams.get('state')
    const orders = await listMarketplaceOrders({
      storeId: searchParams.get('storeId') || undefined,
      state: state === 'PENDING' || state === 'IMPORTED' ? state : 'ALL',
      q: searchParams.get('q') || undefined,
    })
    return NextResponse.json({ success: true, orders })
  } catch (err) {
    return listingErrorResponse(err, 'Pazaryeri siparişleri listelenemedi.')
  }
}
