import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { mapListing, setListingIgnored, setListingTargetPrice } from '@/lib/services/marketplace/listings.service'
import { listingErrorResponse } from '../route-error'

type Body =
  | { action: 'map'; productId: string | null; variantId?: string | null; applyToModel?: boolean }
  | { action: 'ignore'; ignored: boolean }
  | { action: 'price'; salePrice: number | null; listPrice?: number | null }

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAdmin(request)
    const { id } = await params
    const body = (await request.json()) as Body
    switch (body.action) {
      case 'map': {
        const result = await mapListing(
          id,
          { productId: body.productId || null, variantId: body.variantId ?? null, applyToModel: body.applyToModel },
          user.id
        )
        return NextResponse.json({ success: true, ...result })
      }
      case 'ignore':
        await setListingIgnored(id, Boolean(body.ignored), user.id)
        return NextResponse.json({ success: true })
      case 'price':
        await setListingTargetPrice(id, { salePrice: body.salePrice, listPrice: body.listPrice }, user.id)
        return NextResponse.json({ success: true })
      default:
        return NextResponse.json({ success: false, error: 'Geçersiz işlem.' }, { status: 400 })
    }
  } catch (err) {
    return listingErrorResponse(err, 'Pazaryeri ürünü güncellenemedi.')
  }
}
