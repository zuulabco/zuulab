import { NextResponse } from 'next/server'
import { getProductBySlug } from '@/lib/services/products.service'

interface Context {
  params: Promise<{ slug: string }>
}

export async function GET(request: Request, { params }: Context) {
  try {
    const { slug } = await params
    const product = await getProductBySlug(slug)

    if (!product) {
      return NextResponse.json(
        { success: false, error: 'Ürün bulunamadı.' },
        { status: 404 }
      )
    }

    // Do NOT expose internal cost information to customers
    const { cost, ...safeProduct } = product as any

    return NextResponse.json({
      success: true,
      data: safeProduct,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: 'Ürün detayları alınırken bir hata oluştu.' },
      { status: 500 }
    )
  }
}
