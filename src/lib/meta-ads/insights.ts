/**
 * Meta ad performance: turns the Marketing API's insight rows into the numbers the admin reads,
 * and adds rows together correctly. Pure functions; the request lives in services/meta-ads.service.ts.
 *
 * - Clicks are link clicks (people who went to the site); CTR, CPC and CPM are computed here from
 *   the raw sums, so totals are right (an average of rates would not be).
 * - Meta reports one conversion under several action types (omni_purchase, the pixel's purchase,
 *   the generic "purchase"). Only the first type found in a fixed order is used, so nothing is counted twice.
 * - ROAS here is the conversion value Meta credits to the ad divided by spend. It is Meta's own claim,
 *   not a measured sale: the shop's orders are the truth (Faz 13 puts the two side by side).
 */

export interface InsightRow {
  campaign_id?: string
  campaign_name?: string
  adset_id?: string
  adset_name?: string
  ad_id?: string
  ad_name?: string
  date_start?: string
  spend?: string
  impressions?: string
  reach?: string
  inline_link_clicks?: string
  actions?: Array<{ action_type: string; value: string }>
  action_values?: Array<{ action_type: string; value: string }>
}

export interface AdMetrics {
  spend: number
  impressions: number
  /** Reach cannot be added across rows (the same person appears in several), so totals use the account-level figure */
  reach: number
  linkClicks: number
  addToCart: number
  initiateCheckout: number
  purchases: number
  /** Conversion value Meta credits to the ads, in the account currency */
  purchaseValue: number
  /** linkClicks / impressions */
  ctr: number | null
  /** spend per link click */
  cpc: number | null
  /** spend per 1000 impressions */
  cpm: number | null
  /** purchaseValue / spend; null without spend */
  roas: number | null
  /** spend per purchase; null without purchases */
  costPerPurchase: number | null
}

const ORDER = {
  addToCart: ['omni_add_to_cart', 'offsite_conversion.fb_pixel_add_to_cart', 'add_to_cart'],
  initiateCheckout: ['omni_initiated_checkout', 'offsite_conversion.fb_pixel_initiate_checkout', 'initiate_checkout'],
  purchase: ['omni_purchase', 'offsite_conversion.fb_pixel_purchase', 'purchase'],
} as const

const n = (v: unknown) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

/** The value of the first action type present, in priority order */
export function pickAction(list: Array<{ action_type: string; value: string }> | undefined, order: readonly string[]): number {
  for (const type of order) {
    const hit = list?.find((a) => a.action_type === type)
    if (hit) return n(hit.value)
  }
  return 0
}

const div = (a: number, b: number) => (b > 0 ? a / b : null)

/** Derived rates from raw sums */
export function withRates(
  raw: Pick<AdMetrics, 'spend' | 'impressions' | 'reach' | 'linkClicks' | 'addToCart' | 'initiateCheckout' | 'purchases' | 'purchaseValue'>
): AdMetrics {
  return {
    ...raw,
    ctr: div(raw.linkClicks, raw.impressions),
    cpc: div(raw.spend, raw.linkClicks),
    cpm: raw.impressions > 0 ? (raw.spend / raw.impressions) * 1000 : null,
    roas: div(raw.purchaseValue, raw.spend),
    costPerPurchase: div(raw.spend, raw.purchases),
  }
}

export function metricsOf(row: InsightRow): AdMetrics {
  return withRates({
    spend: n(row.spend),
    impressions: n(row.impressions),
    reach: n(row.reach),
    linkClicks: n(row.inline_link_clicks),
    addToCart: pickAction(row.actions, ORDER.addToCart),
    initiateCheckout: pickAction(row.actions, ORDER.initiateCheckout),
    purchases: pickAction(row.actions, ORDER.purchase),
    purchaseValue: pickAction(row.action_values, ORDER.purchase),
  })
}

/** Adds rows together; `reach` is supplied by the caller (it is not additive) */
export function sumMetrics(rows: AdMetrics[], reach: number): AdMetrics {
  const t = rows.reduce(
    (acc, r) => ({
      spend: acc.spend + r.spend,
      impressions: acc.impressions + r.impressions,
      linkClicks: acc.linkClicks + r.linkClicks,
      addToCart: acc.addToCart + r.addToCart,
      initiateCheckout: acc.initiateCheckout + r.initiateCheckout,
      purchases: acc.purchases + r.purchases,
      purchaseValue: acc.purchaseValue + r.purchaseValue,
    }),
    { spend: 0, impressions: 0, linkClicks: 0, addToCart: 0, initiateCheckout: 0, purchases: 0, purchaseValue: 0 }
  )
  return withRates({ ...t, reach })
}

export interface NamedMetrics {
  id: string
  name: string
  metrics: AdMetrics
}

export type InsightLevel = 'campaign' | 'adset' | 'ad'

const KEYS: Record<InsightLevel, { id: keyof InsightRow; name: keyof InsightRow }> = {
  campaign: { id: 'campaign_id', name: 'campaign_name' },
  adset: { id: 'adset_id', name: 'adset_name' },
  ad: { id: 'ad_id', name: 'ad_name' },
}

/** Rows of one level, biggest spender first */
export function rowsByLevel(rows: InsightRow[], level: InsightLevel): NamedMetrics[] {
  const k = KEYS[level]
  return rows
    .map((r) => ({ id: String(r[k.id] ?? ''), name: String(r[k.name] ?? ''), metrics: metricsOf(r) }))
    .filter((r) => r.id)
    .sort((a, b) => b.metrics.spend - a.metrics.spend)
}

export interface DayPoint {
  day: string
  spend: number
  linkClicks: number
  purchases: number
  purchaseValue: number
}

export function dailySeries(rows: InsightRow[]): DayPoint[] {
  return rows
    .filter((r) => r.date_start)
    .map((r) => {
      const m = metricsOf(r)
      return { day: String(r.date_start), spend: m.spend, linkClicks: m.linkClicks, purchases: m.purchases, purchaseValue: m.purchaseValue }
    })
    .sort((a, b) => a.day.localeCompare(b.day))
}
