import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { refreshAllStoreListings, refreshStoreListings } from '@/lib/services/marketplace/listings.service'
import { listingErrorResponse } from '../route-error'

/** Reads live listings from the marketplace: one store ({storeId}) or all active stores. */
export async function POST(request: Request) {
  try {
    const user = await requireAdmin(request)
    const body = (await request.json().catch(() => ({}))) as { storeId?: string }
    const results = body.storeId
      ? [await refreshStoreListings(body.storeId, user.id)]
      : await refreshAllStoreListings(user.id)
    return NextResponse.json({ success: true, results })
  } catch (err) {
    return listingErrorResponse(err, 'Ürünler pazaryerinden okunamadı.')
  }
}
