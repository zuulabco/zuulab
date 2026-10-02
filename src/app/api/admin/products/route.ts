import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { adminGetProducts, adminCreateProduct } from '@/lib/services/catalog-admin.service'

export async function GET(request: Request) {
  try {
    await requirePermission(request, 'PRODUCT_VIEW')

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || undefined
    const collection = searchParams.get('collection') || undefined
    const category = searchParams.get('category') || undefined
    const status = searchParams.get('status') || undefined
    const stockLevel = (searchParams.get('stockLevel') as any) || undefined
    const sort = (searchParams.get('sort') as any) || 'newest'
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 50
    const offset = searchParams.get('offset') ? Number(searchParams.get('offset')) : 0

    const result = await adminGetProducts({
      search,
      collection,
      category,
      status,
      stockLevel,
      sort,
      limit,
      offset,
    })

    return NextResponse.json({
      success: true,
      total: result.total,
      products: result.items,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message || 'Ürünler yüklenemedi.' },
      { status: isForbidden ? 403 : 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'PRODUCT_CREATE')
    const body = await request.json().catch(() => ({}))

    if (!body.name || !body.price || !body.categoryId) {
      return NextResponse.json(
        { success: false, error: 'Ürün adı, satış fiyatı ve kategori zorunludur.' },
        { status: 400 }
      )
    }

    const product = await adminCreateProduct(body, user.email)


    return NextResponse.json({
      success: true,
      message: 'Ürün başarıyla oluşturuldu.',
      product,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isValidation = error.statusCode === 400 || error.isValidation || error.message?.includes('Geçersiz')
    return NextResponse.json(
      { success: false, error: error.message || 'Ürün oluşturulamadı.' },
      { status: isForbidden ? 403 : isValidation ? 400 : 500 }
    )
  }
}
