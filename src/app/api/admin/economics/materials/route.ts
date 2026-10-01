import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { getMaterials, saveMaterial, getMaterialPriceHistory } from '@/lib/services/product-economics.service'

export async function GET(request: Request) {
  try {
    const user = await requirePermission(request, 'PRODUCT_ECONOMICS_VIEW')
    const { searchParams } = new URL(request.url)
    const historyFor = searchParams.get('historyFor')
    const storeId = user.storeId || null

    if (historyFor) {
      const history = await getMaterialPriceHistory(historyFor)
      return NextResponse.json({ success: true, history })
    }

    const materials = await getMaterials(storeId)
    return NextResponse.json({
      success: true,
      materials,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'PRODUCT_ECONOMICS_MANAGE')
    const body = await request.json().catch(() => ({}))
    const storeId = user.storeId || null

    const result = await saveMaterial(body, user.email, storeId)
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Malzeme profili kaydedildi.',
      material: result.material,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
