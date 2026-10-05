import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { getInternalReport } from '@/lib/services/analytics/internal-analytics.service'
import { PeriodError, resolvePeriod } from '@/lib/analytics/period'

export const dynamic = 'force-dynamic'

/**
 * ZUULAB's own numbers (visitors, funnel, conversion, abandonment, revenue, products) for
 * today, the last 7 / 28 / 90 days (?range=today|7|28|90) or a span (?start=&end=), with
 * the period before it for comparison.
 */
export async function GET(request: Request) {
  try {
    await requirePermission(request, 'ANALYTICS_VIEW')
    const period = resolvePeriod(new URL(request.url).searchParams)
    return NextResponse.json({ success: true, report: await getInternalReport(period) })
  } catch (error) {
    if (error instanceof PeriodError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    }
    const message = (error as Error).message || ''
    const status = message.includes('FORBIDDEN') ? 403 : message.includes('UNAUTHORIZED') ? 401 : 500
    if (status === 500) console.error('[admin/insights]', error)
    return NextResponse.json({ success: false, error: status === 500 ? 'Analiz verileri alınamadı.' : message }, { status })
  }
}
