import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { getEconomicsSummary } from '@/lib/services/product-economics.service'

export async function GET(request: Request) {
  try {
    const user = await requirePermission(request, 'PRODUCT_ECONOMICS_VIEW')
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || 'this_month'
    const channel = searchParams.get('channel') || 'ALL'
    const storeId = user.storeId || null

    const summary = await getEconomicsSummary({ period, channel, storeId })

    return NextResponse.json({
      success: true,
      summary,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
