import 'server-only'
import {
  GoogleApiError,
  googleApiPost,
  isServiceAccountConfigured,
  serviceAccountEmail,
  type GoogleApiErrorCode,
} from '@/lib/google/service-account'
import { SITE_URL } from '@/lib/config/urls'
import type { AnalyticsPeriod } from '@/lib/analytics/period'

/**
 * Reports for the admin's Analizler page: Google Analytics 4 (visitors, pages,
 * sources, products, clicks) and Google Search Console (Google search queries).
 *
 * Each report is its own request, so one that fails (a metric GA has no data for
 * yet, Search Console still verifying) leaves the rest of the page working.
 * Successful results are kept for 15 minutes per period; errors are not cached,
 * so a fixed setting shows up on the next load.
 */

const GA_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly'
const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly'

const gaPropertyId = (process.env.GA4_PROPERTY_ID || '').replace(/\D/g, '')
/** "sc-domain:zuulab.com" for a domain property, or the URL-prefix property's URL */
const gscSite = (process.env.GSC_SITE_URL || '').trim()

export interface AnalyticsSetup {
  measurementId: boolean
  propertyId: boolean
  searchConsoleSite: string | null
  serviceAccount: string | null
}

export function analyticsSetup(): AnalyticsSetup {
  return {
    measurementId: Boolean((process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '').trim()),
    propertyId: Boolean(gaPropertyId),
    searchConsoleSite: gscSite || null,
    serviceAccount: isServiceAccountConfigured ? serviceAccountEmail : null,
  }
}

type Row = Record<string, string | number>
export interface ReportError {
  code: GoogleApiErrorCode
  message: string
}
type Result<T> = { data: T; error?: undefined } | { data: null; error: ReportError }

// ── Google Analytics 4 ───────────────────────────────────────────────

interface GaResponse {
  dimensionHeaders?: Array<{ name: string }>
  metricHeaders?: Array<{ name: string }>
  rows?: Array<{ dimensionValues?: Array<{ value: string }>; metricValues?: Array<{ value: string }> }>
}

interface GaRequest {
  dimensions?: string[]
  metrics: string[]
  dateRanges?: Array<{ startDate: string; endDate: string; name?: string }>
  orderBy?: { metric?: string; dimension?: string; desc?: boolean }
  limit?: number
  dimensionFilter?: unknown
}

function toRows(res: GaResponse): Row[] {
  const dims = res.dimensionHeaders?.map((h) => h.name) ?? []
  const mets = res.metricHeaders?.map((h) => h.name) ?? []
  return (res.rows ?? []).map((r) => {
    const row: Row = {}
    dims.forEach((d, i) => (row[d] = r.dimensionValues?.[i]?.value ?? ''))
    mets.forEach((m, i) => (row[m] = Number(r.metricValues?.[i]?.value ?? 0)))
    return row
  })
}

async function gaReport(req: GaRequest, period: AnalyticsPeriod): Promise<Row[]> {
  const body = {
    dateRanges: req.dateRanges ?? [{ startDate: period.start, endDate: period.end }],
    dimensions: req.dimensions?.map((name) => ({ name })),
    metrics: req.metrics.map((name) => ({ name })),
    ...(req.orderBy
      ? {
          orderBys: [
            req.orderBy.metric
              ? { metric: { metricName: req.orderBy.metric }, desc: req.orderBy.desc ?? true }
              : { dimension: { dimensionName: req.orderBy.dimension }, desc: req.orderBy.desc ?? false },
          ],
        }
      : {}),
    ...(req.limit ? { limit: req.limit } : {}),
    ...(req.dimensionFilter ? { dimensionFilter: req.dimensionFilter } : {}),
  }
  const res = await googleApiPost<GaResponse>(
    `https://analyticsdata.googleapis.com/v1beta/properties/${gaPropertyId}:runReport`,
    [GA_SCOPE],
    body
  )
  return toRows(res)
}

async function attempt<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { data: await fn() }
  } catch (e) {
    const err = e instanceof GoogleApiError ? e : new GoogleApiError((e as Error).message || 'Bilinmeyen hata', 'failed')
    return { data: null, error: { code: err.code, message: err.message.slice(0, 300) } }
  }
}

const inList = (field: string, values: string[]) => ({
  filter: { fieldName: field, inListFilter: { values } },
})

/** E-commerce and contact events shown as the funnel and the actions list */
export const TRACKED_EVENTS = [
  'view_item',
  'select_item',
  'add_to_cart',
  'view_cart',
  'begin_checkout',
  'purchase',
  'add_to_wishlist',
  'search',
  'whatsapp_click',
  'generate_lead',
  'sign_up',
]

async function loadGa(period: AnalyticsPeriod) {
  const current = { startDate: period.start, endDate: period.end, name: 'current' }
  const previous = { startDate: period.previous.start, endDate: period.previous.end, name: 'previous' }
  // A single day is drawn hour by hour
  const trendBy = period.days === 1 ? 'hour' : 'date'

  const [kpis, trend, pages, channels, sources, devices, cities, products, events, clicks, hours, visitors, realtime] =
    await Promise.all([
      attempt(() =>
        gaReport(
          {
            dateRanges: [current, previous],
            metrics: ['activeUsers', 'newUsers', 'sessions', 'screenPageViews', 'engagementRate', 'averageSessionDuration'],
          },
          period
        )
      ),
      attempt(() =>
        gaReport({ dimensions: [trendBy], metrics: ['activeUsers', 'sessions', 'screenPageViews'], orderBy: { dimension: trendBy } }, period)
      ),
      attempt(() =>
        gaReport(
          { dimensions: ['pagePath'], metrics: ['screenPageViews', 'activeUsers', 'averageSessionDuration'], orderBy: { metric: 'screenPageViews' }, limit: 15 },
          period
        )
      ),
      attempt(() => gaReport({ dimensions: ['sessionDefaultChannelGroup'], metrics: ['sessions', 'activeUsers'], orderBy: { metric: 'sessions' } }, period)),
      attempt(() => gaReport({ dimensions: ['sessionSourceMedium'], metrics: ['sessions'], orderBy: { metric: 'sessions' }, limit: 10 }, period)),
      attempt(() => gaReport({ dimensions: ['deviceCategory'], metrics: ['activeUsers'], orderBy: { metric: 'activeUsers' } }, period)),
      attempt(() => gaReport({ dimensions: ['city'], metrics: ['activeUsers'], orderBy: { metric: 'activeUsers' }, limit: 10 }, period)),
      attempt(() =>
        gaReport(
          {
            dimensions: ['itemName'],
            metrics: ['itemsViewed', 'itemsAddedToCart', 'itemsPurchased', 'itemRevenue'],
            orderBy: { metric: 'itemsViewed' },
            limit: 15,
          },
          period
        )
      ),
      attempt(() =>
        gaReport({ dimensions: ['eventName'], metrics: ['eventCount', 'totalUsers'], dimensionFilter: inList('eventName', TRACKED_EVENTS) }, period)
      ),
      attempt(() =>
        gaReport(
          {
            dimensions: ['linkText', 'linkUrl'],
            metrics: ['eventCount'],
            dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'ui_click' } } },
            orderBy: { metric: 'eventCount' },
            limit: 20,
          },
          period
        )
      ),
      attempt(() => gaReport({ dimensions: ['hour'], metrics: ['activeUsers'], orderBy: { dimension: 'hour' } }, period)),
      attempt(() => gaReport({ dimensions: ['newVsReturning'], metrics: ['activeUsers'] }, period)),
      attempt(async () => {
        const res = await googleApiPost<GaResponse>(
          `https://analyticsdata.googleapis.com/v1beta/properties/${gaPropertyId}:runRealtimeReport`,
          [GA_SCOPE],
          { metrics: [{ name: 'activeUsers' }] }
        )
        return Number(toRows(res)[0]?.activeUsers ?? 0)
      }),
    ])

  return { kpis, trend, pages, channels, sources, devices, cities, products, events, clicks, hours, visitors, realtime }
}

// ── Google Search Console ────────────────────────────────────────────

interface GscResponse {
  rows?: Array<{ keys?: string[]; clicks: number; impressions: number; ctr: number; position: number }>
}

async function gscQuery(period: AnalyticsPeriod, dimensions: string[], rowLimit: number) {
  const res = await googleApiPost<GscResponse>(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(gscSite)}/searchAnalytics/query`,
    [GSC_SCOPE],
    { startDate: period.start, endDate: period.end, dimensions, rowLimit, dataState: 'all' }
  )
  return (res.rows ?? []).map((r) => ({
    key: r.keys?.[0] ?? '',
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }))
}

async function loadSearchConsole(period: AnalyticsPeriod) {
  const [byDate, queries, pages, devices] = await Promise.all([
    attempt(() => gscQuery(period, ['date'], 500)),
    attempt(() => gscQuery(period, ['query'], 20)),
    attempt(() => gscQuery(period, ['page'], 15)),
    attempt(() => gscQuery(period, ['device'], 5)),
  ])
  return {
    byDate,
    queries,
    // Page URLs shown as paths: "https://www.zuulab.com/urun/x" → "/urun/x"
    pages: pages.data
      ? { data: pages.data.map((p) => ({ ...p, key: p.key.replace(SITE_URL, '') || '/' })) }
      : pages,
    devices,
  }
}

// ── Assembled report, cached ──────────────────────────────────────────

export type GaReport = Awaited<ReturnType<typeof loadGa>>
export type GscReport = Awaited<ReturnType<typeof loadSearchConsole>>

export interface AnalyticsReport {
  period: AnalyticsPeriod
  setup: AnalyticsSetup
  generatedAt: string
  ga: GaReport | null
  gsc: GscReport | null
}

const TTL = 15 * 60_000
/** Keyed by "start:end"; custom spans make it grow, so the oldest entries are dropped */
const cache = new Map<string, { at: number; report: AnalyticsReport }>()
const CACHE_LIMIT = 40

/** Errors that a settings change fixes (access, disabled API); these are never cached */
const SETUP_ERRORS = new Set<GoogleApiErrorCode>(['not_configured', 'auth_failed', 'api_disabled', 'no_access'])
const hasErrors = (part: Record<string, unknown> | null) =>
  part !== null &&
  Object.values(part).some((r) => {
    const error = r && typeof r === 'object' && 'error' in r ? (r as Result<unknown>).error : undefined
    return Boolean(error && SETUP_ERRORS.has(error.code))
  })

export async function getAnalyticsReport(period: AnalyticsPeriod, fresh = false): Promise<AnalyticsReport> {
  const key = `${period.start}:${period.end}`
  const hit = cache.get(key)
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.report

  const setup = analyticsSetup()
  const canCall = Boolean(setup.serviceAccount)
  const [ga, gsc] = await Promise.all([
    canCall && setup.propertyId ? loadGa(period) : Promise.resolve(null),
    canCall && setup.searchConsoleSite ? loadSearchConsole(period) : Promise.resolve(null),
  ])
  const report: AnalyticsReport = { period, setup, generatedAt: new Date().toISOString(), ga, gsc }
  // Keep only clean results; a setup error must disappear as soon as it is fixed
  if (!hasErrors(ga) && !hasErrors(gsc)) {
    cache.delete(key)
    cache.set(key, { at: Date.now(), report })
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!)
  }
  return report
}
