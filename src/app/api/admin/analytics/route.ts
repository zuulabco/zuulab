import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { getAnalyticsReport, type AnalyticsRange } from '@/lib/services/analytics/google-analytics.service'

const RANGES: AnalyticsRange[] = [7, 28, 90]

/** Analizler page: GA4 + Search Console report for the last 7 / 28 / 90 days */
export async function GET(request: Request) {
  try {
    await requirePermission(request, 'ANALYTICS_VIEW')
    const url = new URL(request.url)
    const asked = Number(url.searchParams.get('range'))
    const range = RANGES.includes(asked as AnalyticsRange) ? (asked as AnalyticsRange) : 28
    const report = await getAnalyticsReport(range, url.searchParams.get('fresh') === '1')
    return NextResponse.json({ success: true, report })
  } catch (error) {
    const message = (error as Error).message || ''
    const status = message.includes('FORBIDDEN') ? 403 : message.includes('UNAUTHORIZED') ? 401 : 500
    if (status === 500) console.error('[admin/analytics]', error)
    return NextResponse.json({ success: false, error: status === 500 ? 'Analiz verileri alınamadı.' : message }, { status })
  }
}
