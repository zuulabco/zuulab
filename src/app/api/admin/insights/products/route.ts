import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { getProductReport } from '@/lib/services/analytics/product-analytics.service'
import { PeriodError, resolvePeriod } from '@/lib/analytics/period'

export const dynamic = 'force-dynamic'

/**
 * Product analytics: views, carts, checkouts, sales, revenue, average price and sales sources
 * per product, rankings and opportunities, for the chosen period (?range=7|28|90|today or
 * ?start=&end=) and the one before it.
 */
export async function GET(request: Request) {
  try {
    await requirePermission(request, 'ANALYTICS_VIEW')
    const period = resolvePeriod(new URL(request.url).searchParams)
    return NextResponse.json({ success: true, report: await getProductReport(period) })
  } catch (error) {
    if (error instanceof PeriodError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    }
    const message = (error as Error).message || ''
    const status = message.includes('FORBIDDEN') ? 403 : message.includes('UNAUTHORIZED') ? 401 : 500
    if (status === 500) console.error('[admin/insights/products]', error)
    return NextResponse.json({ success: false, error: status === 500 ? 'Ürün verileri alınamadı.' : message }, { status })
  }
}
