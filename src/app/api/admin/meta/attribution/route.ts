import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { MetaAdsError } from '@/lib/services/meta-ads.service'
import { getAttributionReport } from '@/lib/services/meta-attribution.service'
import { PeriodError, resolvePeriod } from '@/lib/analytics/period'
import { URL_TAGS } from '@/lib/meta-ads/builders'

export const dynamic = 'force-dynamic'

/** GET ?range=today|7|28|90 (or start/end) → Meta's ad numbers beside the shop's own measured visits and sales */
export async function GET(request: Request) {
  try {
    await requirePermission(request, 'ANALYTICS_VIEW')
    const url = new URL(request.url)
    const report = await getAttributionReport(resolvePeriod(url.searchParams), url.searchParams.get('fresh') === '1')
    return NextResponse.json({ success: true, report, urlTags: URL_TAGS }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof PeriodError || error instanceof MetaAdsError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    }
    const message = (error as Error)?.message || ''
    const status = message.includes('FORBIDDEN') ? 403 : message.includes('UNAUTHORIZED') ? 401 : 500
    if (status === 500) console.error('[admin/meta/attribution]', error)
    return NextResponse.json({ success: false, error: status === 500 ? 'Rapor alınamadı.' : message }, { status })
  }
}
