import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { getSeoReport } from '@/lib/services/analytics/seo-report.service'
import { PeriodError, resolvePeriod } from '@/lib/analytics/period'

/**
 * SEO page: Google Search Console for the last 7 / 28 / 90 days (?range=7|28|90) or a
 * chosen span (?start=YYYY-MM-DD&end=YYYY-MM-DD), with the period before it for comparison.
 */
export async function GET(request: Request) {
  try {
    await requirePermission(request, 'ANALYTICS_VIEW')
    const url = new URL(request.url)
    const period = resolvePeriod(url.searchParams)
    const report = await getSeoReport(period, url.searchParams.get('fresh') === '1')
    return NextResponse.json({ success: true, report })
  } catch (error) {
    if (error instanceof PeriodError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    }
    const message = (error as Error).message || ''
    const status = message.includes('FORBIDDEN') ? 403 : message.includes('UNAUTHORIZED') ? 401 : 500
    if (status === 500) console.error('[admin/seo]', error)
    return NextResponse.json({ success: false, error: status === 500 ? 'SEO verileri alınamadı.' : message }, { status })
  }
}
