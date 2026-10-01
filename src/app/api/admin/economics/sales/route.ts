import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { getHistoricalSalesEconomics } from '@/lib/services/product-economics.service'

export async function GET(request: Request) {
  try {
    const user = await requirePermission(request, 'PRODUCT_ECONOMICS_VIEW')
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || 'this_month'
    const channel = searchParams.get('channel') || 'ALL'
    const productId = searchParams.get('productId') || undefined
    const storeId = user.storeId || null

    const sales = await getHistoricalSalesEconomics({
      period,
      channel,
      productId,
      storeId,
    })

    return NextResponse.json({
      success: true,
      sales,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
