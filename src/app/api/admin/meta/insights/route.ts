import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { MetaAdsError, getInsightsReport } from '@/lib/services/meta-ads.service'
import { PeriodError, resolvePeriod } from '@/lib/analytics/period'
import type { InsightLevel } from '@/lib/meta-ads/insights'

export const dynamic = 'force-dynamic'

/** GET ?range=today|7|28|90 (or start/end) &level=campaign|adset|ad → Meta ad performance and the span before it */
export async function GET(request: Request) {
  try {
    await requirePermission(request, 'ANALYTICS_VIEW')
    const url = new URL(request.url)
    const level = (['campaign', 'adset', 'ad'] as const).find((l) => l === url.searchParams.get('level')) ?? 'campaign'
    const period = resolvePeriod(url.searchParams)
    const report = await getInsightsReport(period, level as InsightLevel, url.searchParams.get('fresh') === '1')
    return NextResponse.json({ success: true, report }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof PeriodError || error instanceof MetaAdsError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    }
    const message = (error as Error)?.message || ''
    const status = message.includes('FORBIDDEN') ? 403 : message.includes('UNAUTHORIZED') ? 401 : 500
    if (status === 500) console.error('[admin/meta/insights]', error)
    return NextResponse.json({ success: false, error: status === 500 ? 'Reklam raporu alınamadı.' : message }, { status })
  }
}
