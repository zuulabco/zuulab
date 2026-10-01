import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { getProductEconomics } from '@/lib/services/product-economics.service'

interface Context {
  params: Promise<{ id: string }>
}

export async function GET(request: Request, { params }: Context) {
  try {
    const user = await requirePermission(request, 'PRODUCT_ECONOMICS_VIEW')
    const { id } = await params

    const storeId = user.storeId || null
    const economics = await getProductEconomics(id, storeId)
    if (!economics) {
      return NextResponse.json(
        { success: false, error: 'Ürün ekonomisi verisi bulunamadı.' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      economics,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
