import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { getProductionSummary, getLowStockProductsForProduction } from '@/lib/services/production.service'

export async function GET(request: Request) {
  try {
    await requirePermission(request, 'PRODUCTION_VIEW')
    const [summary, lowStock] = await Promise.all([
      getProductionSummary(),
      getLowStockProductsForProduction(),
    ])
    return NextResponse.json({ success: true, summary, lowStock })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json({ success: false, error: error.message }, { status: isForbidden ? 403 : isAuth ? 401 : 500 })
  }
}