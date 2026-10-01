import { NextResponse } from 'next/server'
import { getCollectionConfig } from '@/config/collections'
import { getProductsByCollection } from '@/lib/mock-data'

interface Context {
  params: Promise<{ slug: string }>
}

export async function GET(request: Request, { params }: Context) {
  try {
    const { slug } = await params
    const config = getCollectionConfig(slug)

    if (!config) {
      return NextResponse.json(
        { success: false, error: 'Koleksiyon bulunamadı.' },
        { status: 404 }
      )
    }

    const products = getProductsByCollection(config.slug).map((p) => {
      const { cost, ...safe } = p as any
      return safe
    })

    return NextResponse.json({
      success: true,
      collection: config,
      productCount: products.length,
      products,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: 'Koleksiyon verileri alınırken bir hata oluştu.' },
      { status: 500 }
    )
  }
}
