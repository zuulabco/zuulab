import { NextResponse } from 'next/server'
import { getProducts } from '@/lib/services/products.service'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const collectionSlug = searchParams.get('collection') || undefined
    const categorySlug = searchParams.get('category') || undefined
    const inStock = searchParams.get('inStock') === 'true'
    const maxPrice = searchParams.get('maxPrice')
      ? Number(searchParams.get('maxPrice'))
      : undefined
    const search = searchParams.get('search') || undefined
    const sort = (searchParams.get('sort') as any) || 'featured'
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 50
    const offset = searchParams.get('offset') ? Number(searchParams.get('offset')) : 0

    const result = await getProducts({
      collectionSlug,
      categorySlug,
      inStock,
      maxPrice,
      search,
      sort,
      limit,
      offset,
    })

    return NextResponse.json({
      success: true,
      total: result.total,
      data: result.items,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: 'Ürünler yüklenirken bir hata oluştu.' },
      { status: 500 }
    )
  }
}
