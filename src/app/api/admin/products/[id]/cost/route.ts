import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { updateProductCostProfile, getProductEconomics } from '@/lib/services/product-economics.service'

interface Context {
  params: Promise<{ id: string }>
}

export async function PUT(request: Request, { params }: Context) {
  try {
    const user = await requirePermission(request, 'PRODUCT_ECONOMICS_MANAGE')
    const { id } = await params
    const body = await request.json().catch(() => ({}))

    const storeId = user.storeId || null
    const result = await updateProductCostProfile(id, body, user.email, storeId)

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      )
    }

    const economics = await getProductEconomics(id, storeId)

    return NextResponse.json({
      success: true,
      message: 'Ürün maliyet profili başarıyla güncellendi.',
      profile: result.profile,
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
