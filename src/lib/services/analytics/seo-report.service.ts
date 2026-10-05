import 'server-only'
import { GoogleApiError, googleApiPost, type GoogleApiErrorCode } from '@/lib/google/service-account'
import { getProducts } from '@/lib/services/catalog/catalog.service'
import { analyticsSetup, type AnalyticsSetup, type ReportError } from './google-analytics.service'
import type { AnalyticsPeriod } from '@/lib/analytics/period'
import {
  lowCtrRows,
  movers,
  nearTopRows,
  productRows,
  totalsOf,
  withPrevious,
  type GscRow,
  type Mover,
  type ProductSeoRow,
  type SeoRow,
  type Totals,
} from '@/lib/analytics/seo'

/**
 * Report behind the admin SEO page: Google Search Console for the chosen period and the
 * period just before it, so every number can be shown with its change. Each part is its
 * own request, so one that fails leaves the rest of the page working.
 */

const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly'
const gscSite = (process.env.GSC_SITE_URL || '').trim()

type Result<T> = { data: T; error?: undefined } | { data: null; error: ReportError }

interface GscResponse {
  rows?: Array<{ keys?: string[]; clicks: number; impressions: number; ctr: number; position: number }>
}

async function query(range: { start: string; end: string }, dimension: string, rowLimit: number): Promise<GscRow[]> {
  const res = await googleApiPost<GscResponse>(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(gscSite)}/searchAnalytics/query`,
    [GSC_SCOPE],
    { startDate: range.start, endDate: range.end, dimensions: [dimension], rowLimit, dataState: 'all' }
  )
  return (res.rows ?? []).map((r) => ({
    key: r.keys?.[0] ?? '',
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }))
}

async function attempt<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { data: await fn() }
  } catch (e) {
    const err = e instanceof GoogleApiError ? e : new GoogleApiError((e as Error).message || 'Bilinmeyen hata', 'failed')
    return { data: null, error: { code: err.code as GoogleApiErrorCode, message: err.message.slice(0, 300) } }
  }
}

export interface SeoOpportunities {
  /** Pages shown often and well placed but clicked less than their position suggests */
  lowCtrPages: SeoRow[]
  lowCtrQueries: SeoRow[]
  /** Queries just outside the top 3 or just off page one */
  nearTopQueries: SeoRow[]
  rising: Array<Mover<ProductSeoRow>>
  falling: Array<Mover<ProductSeoRow>>
}

export interface SeoReport {
  period: AnalyticsPeriod
  setup: AnalyticsSetup
  generatedAt: string
  /** null = Search Console is not configured */
  gsc: null | {
    totals: Result<{ current: Totals; previous: Totals }>
    byDate: Result<GscRow[]>
    queries: Result<SeoRow[]>
    pages: Result<SeoRow[]>
    products: Result<ProductSeoRow[]>
    countries: Result<SeoRow[]>
    devices: Result<SeoRow[]>
    opportunities: Result<SeoOpportunities>
  }
}

const TTL = 15 * 60_000
const cache = new Map<string, { at: number; report: SeoReport }>()
const CACHE_LIMIT = 20
const SETUP_ERRORS = new Set<GoogleApiErrorCode>(['not_configured', 'auth_failed', 'api_disabled', 'no_access'])

async function loadGsc(period: AnalyticsPeriod): Promise<NonNullable<SeoReport['gsc']>> {
  const cur = { start: period.start, end: period.end }
  const prev = period.previous
  const [dateNow, datePrev, qNow, qPrev, pNow, pPrev, cNow, cPrev, dNow, dPrev] = await Promise.all([
    attempt(() => query(cur, 'date', 500)),
    attempt(() => query(prev, 'date', 500)),
    attempt(() => query(cur, 'query', 250)),
    attempt(() => query(prev, 'query', 250)),
    attempt(() => query(cur, 'page', 250)),
    attempt(() => query(prev, 'page', 250)),
    attempt(() => query(cur, 'country', 25)),
    attempt(() => query(prev, 'country', 25)),
    attempt(() => query(cur, 'device', 5)),
    attempt(() => query(prev, 'device', 5)),
  ])

  /** This period's rows with the previous period's attached; a failed previous request only drops the comparison */
  const paired = (now: Result<GscRow[]>, before: Result<GscRow[]>): Result<SeoRow[]> =>
    now.data ? { data: withPrevious(now.data, before.data ?? []) } : { data: null, error: now.error }

  const queries = paired(qNow, qPrev)
  const pages = paired(pNow, pPrev)

  let products: Result<ProductSeoRow[]>
  if (pNow.data) {
    const catalog = await getProducts({ limit: 1000 }).then((r) => r.items, () => [])
    const before = new Map((pPrev.data ?? []).map((r) => [r.key, r]))
    products = {
      data: productRows(
        pNow.data.map((current) => ({ current, previous: before.get(current.key) ?? null })),
        catalog.map((p) => ({ slug: p.slug, name: p.name }))
      ),
    }
  } else {
    products = { data: null, error: pNow.error }
  }

  const opportunities: Result<SeoOpportunities> =
    pages.data && queries.data && products.data
      ? (() => {
          const { rising, falling } = movers(products.data!)
          return {
            data: {
              lowCtrPages: lowCtrRows(pages.data!),
              lowCtrQueries: lowCtrRows(queries.data!),
              nearTopQueries: nearTopRows(queries.data!),
              rising,
              falling,
            },
          }
        })()
      : { data: null, error: (pages.error ?? queries.error ?? products.error)! }

  return {
    totals: dateNow.data
      ? { data: { current: totalsOf(dateNow.data), previous: totalsOf(datePrev.data ?? []) } }
      : { data: null, error: dateNow.error },
    byDate: dateNow,
    queries,
    pages,
    products,
    countries: paired(cNow, cPrev),
    devices: paired(dNow, dPrev),
    opportunities,
  }
}

export async function getSeoReport(period: AnalyticsPeriod, fresh = false): Promise<SeoReport> {
  const key = `${period.start}:${period.end}`
  const hit = cache.get(key)
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.report

  const setup = analyticsSetup()
  const gsc = setup.serviceAccount && setup.searchConsoleSite ? await loadGsc(period) : null
  const report: SeoReport = { period, setup, generatedAt: new Date().toISOString(), gsc }

  // A setup error must disappear as soon as it is fixed, so only clean results are kept
  const hasSetupError =
    gsc !== null &&
    Object.values(gsc).some((r) => r && typeof r === 'object' && 'error' in r && r.error && SETUP_ERRORS.has(r.error.code))
  if (!hasSetupError) {
    cache.delete(key)
    cache.set(key, { at: Date.now(), report })
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!)
  }
  return report
}
