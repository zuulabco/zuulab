import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/security/rate-limit-response'
import { getProducts } from '@/lib/services/products.service'

/**
 * Storefront product search for the header search box. Searches the cached
 * database catalog (name, SKU, material, description, category, collection),
 * Turkish- and accent-insensitive.
 */
export async function GET(request: Request) {
  const limited = await rateLimit(request, 'search')
  if (limited) return limited

  const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 80)
  if (q.length < 2) {
    return NextResponse.json({ success: true, products: [] })
  }

  const { items } = await getProducts({ search: q, limit: 6 })
  return NextResponse.json({
    success: true,
    products: items.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      price: p.price,
      categoryName: p.categoryName,
      image: (p.images.find((i) => i.isPrimary) ?? p.images[0])?.url ?? null,
    })),
  })
}
