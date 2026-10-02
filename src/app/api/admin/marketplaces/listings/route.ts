import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { db } from '@/prisma/db'
import { getListings, type ListingFilter } from '@/lib/services/marketplace/listings.service'
import { listingErrorResponse } from './route-error'

const FILTERS: ListingFilter[] = ['ALL', 'UNMAPPED', 'MAPPED', 'IGNORED']

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const { searchParams } = new URL(request.url)
    const filterParam = (searchParams.get('filter') || 'ALL').toUpperCase() as ListingFilter
    const listings = await getListings({
      storeId: searchParams.get('storeId') || undefined,
      filter: FILTERS.includes(filterParam) ? filterParam : 'ALL',
    })
    // Site products for the link picker
    const products = await db.orm.public.Product.select('id', 'name', 'sku', 'isActive').all()
    products.sort((a, b) => a.name.localeCompare(b.name, 'tr'))
    return NextResponse.json({ success: true, listings, products })
  } catch (err) {
    return listingErrorResponse(err, 'Pazaryeri ürünleri listelenemedi.')
  }
}
