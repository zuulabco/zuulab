import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { importListingsAsProducts } from '@/lib/services/marketplace/listings.service'
import { listingErrorResponse } from '../route-error'

// Copies product images into Cloudinary, which can take a while for many products.
export const maxDuration = 300

export async function POST(request: Request) {
  try {
    const user = await requireAdmin(request)
    const body = (await request.json().catch(() => ({}))) as { listingIds?: unknown }
    const listingIds = Array.isArray(body.listingIds) ? body.listingIds.filter((x): x is string => typeof x === 'string') : []
    if (listingIds.length === 0) {
      return NextResponse.json({ success: false, error: 'Aktarılacak ürün seçilmedi.' }, { status: 400 })
    }
    const result = await importListingsAsProducts(listingIds.slice(0, 200), user.id)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return listingErrorResponse(err, 'Ürünler siteye aktarılamadı.')
  }
}
