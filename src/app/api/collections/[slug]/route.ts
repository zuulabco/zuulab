import { NextResponse } from 'next/server'
import { getCollectionView } from '@/lib/services/catalog/collection-presentation'
import { getProductsByCollection } from '@/lib/services/products.service'

interface Context {
  params: Promise<{ slug: string }>
}

export async function GET(request: Request, { params }: Context) {
  try {
    const { slug } = await params
    // Only collections that are live in the admin; storefront catalog data only.
    const config = await getCollectionView(slug)

    if (!config) {
      return NextResponse.json(
        { success: false, error: 'Koleksiyon bulunamadı.' },
        { status: 404 }
      )
    }

    // Catalog products carry no cost fields, so they are safe to return as-is.
    const products = await getProductsByCollection(config.slug)

    return NextResponse.json({
      success: true,
      collection: config,
      productCount: products.length,
      products,
    })
  } catch {
    return NextResponse.json(
      { success: false, error: 'Koleksiyon verileri alınırken bir hata oluştu.' },
      { status: 500 }
    )
  }
}
