/**
 * Pure analysis of Search Console rows for the admin SEO page: comparison with the
 * previous period, products behind the product pages, and the opportunity lists.
 * No network and no server imports, so every rule can be tested.
 */

export interface GscRow {
  key: string
  clicks: number
  impressions: number
  /** 0–1 */
  ctr: number
  /** Average position, 1 = first result */
  position: number
}

export interface SeoRow extends GscRow {
  /** The same row in the previous period; null when it did not appear there */
  previous: GscRow | null
}

export interface Totals {
  clicks: number
  impressions: number
  ctr: number
  position: number
}

/** Search Console rows by day → period totals (position is weighted by impressions, as Google does) */
export function totalsOf(days: GscRow[]): Totals {
  const clicks = days.reduce((s, d) => s + d.clicks, 0)
  const impressions = days.reduce((s, d) => s + d.impressions, 0)
  const position = impressions ? days.reduce((s, d) => s + d.position * d.impressions, 0) / impressions : 0
  return { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position }
}

/** Relative change; null when there is nothing to compare with */
export function changeOf(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined || previous === 0) return null
  return (current - previous) / previous
}

/** Rows of this period with the matching row of the previous period attached */
export function withPrevious(current: GscRow[], previous: GscRow[]): SeoRow[] {
  const before = new Map(previous.map((r) => [r.key, r]))
  return current.map((r) => ({ ...r, previous: before.get(r.key) ?? null }))
}

// ── Pages → products ─────────────────────────────────────────────────

/** "https://www.zuulab.com/urun/lamba?x=1" → "/urun/lamba" ("/" for the home page) */
export function pathOfUrl(url: string): string {
  try {
    const p = new URL(url, 'https://x.invalid').pathname.replace(/\/+$/, '')
    return decodeURIComponent(p) || '/'
  } catch {
    return url
  }
}

export type PageKind = 'product' | 'category' | 'collection' | 'home' | 'other'

export function pageKind(path: string): PageKind {
  if (path === '/') return 'home'
  if (path.startsWith('/urun/')) return 'product'
  if (path.startsWith('/kategori/')) return 'category'
  if (path.startsWith('/koleksiyon/')) return 'collection'
  return 'other'
}

export interface ProductRef {
  slug: string
  name: string
}

export interface ProductSeoRow extends SeoRow {
  /** Product name (the page's slug when the product is gone) */
  name: string
  slug: string
}

/**
 * Traffic per product: every page row under /urun/<slug> (query strings and trailing
 * slashes are folded together) summed into one row for that product.
 */
export function productRows(
  pages: Array<{ current: GscRow; previous: GscRow | null }>,
  products: ProductRef[]
): ProductSeoRow[] {
  const names = new Map(products.map((p) => [p.slug, p.name]))
  const sum = (a: GscRow | null, b: GscRow): GscRow => {
    if (!a) return { ...b }
    const impressions = a.impressions + b.impressions
    return {
      key: a.key,
      clicks: a.clicks + b.clicks,
      impressions,
      ctr: impressions ? (a.clicks + b.clicks) / impressions : 0,
      position: impressions ? (a.position * a.impressions + b.position * b.impressions) / impressions : 0,
    }
  }
  const acc = new Map<string, { current: GscRow | null; previous: GscRow | null }>()
  for (const { current, previous } of pages) {
    const path = pathOfUrl(current.key)
    if (pageKind(path) !== 'product') continue
    const slug = path.slice('/urun/'.length)
    const entry = acc.get(slug) ?? { current: null, previous: null }
    entry.current = sum(entry.current, { ...current, key: slug })
    if (previous) entry.previous = sum(entry.previous, { ...previous, key: slug })
    acc.set(slug, entry)
  }
  return [...acc.entries()]
    .map(([slug, v]) => ({ ...v.current!, key: slug, slug, name: names.get(slug) ?? slug, previous: v.previous }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
}

// ── Opportunities ────────────────────────────────────────────────────

/**
 * What share of searchers usually click a result at a given position. A rough industry
 * curve, only used to spot results that are clicked clearly less than their position
 * would suggest (a weak title or description), never shown as a fact.
 */
export function expectedCtr(position: number): number {
  if (position <= 1.5) return 0.28
  if (position <= 2.5) return 0.15
  if (position <= 3.5) return 0.1
  if (position <= 5.5) return 0.06
  if (position <= 10.5) return 0.03
  return 0.01
}

export interface OpportunityOptions {
  /** Ignore rows seen fewer times than this: too little data to judge */
  minImpressions?: number
  limit?: number
}

/** Shown often and well placed, but clicked far less than the position suggests: improve title / description */
export function lowCtrRows<T extends GscRow>(rows: T[], { minImpressions = 50, limit = 8 }: OpportunityOptions = {}): T[] {
  return rows
    .filter((r) => r.impressions >= minImpressions && r.position <= 10.5 && r.ctr < expectedCtr(r.position) * 0.6)
    .map((r) => ({ row: r, missed: r.impressions * expectedCtr(r.position) - r.clicks }))
    .sort((a, b) => b.missed - a.missed)
    .slice(0, limit)
    .map((x) => x.row)
}

/** Just outside the top 3 (positions 4–10) or just off page one (11–20) with real visibility: a push could pay off */
export function nearTopRows<T extends GscRow>(rows: T[], { minImpressions = 30, limit = 8 }: OpportunityOptions = {}): T[] {
  return rows
    .filter((r) => r.impressions >= minImpressions && r.position > 3.5 && r.position <= 20)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, limit)
}

export interface Mover<T> {
  row: T
  /** Clicks gained (+) or lost (−) against the previous period */
  clickChange: number
}

/** The biggest gains and losses in clicks against the previous period */
export function movers<T extends SeoRow>(rows: T[], limit = 5): { rising: Array<Mover<T>>; falling: Array<Mover<T>> } {
  const all = rows
    .map((row) => ({ row, clickChange: row.clicks - (row.previous?.clicks ?? 0) }))
    .filter((m) => m.clickChange !== 0)
  return {
    rising: all
      .filter((m) => m.clickChange > 0)
      .sort((a, b) => b.clickChange - a.clickChange)
      .slice(0, limit),
    falling: all
      .filter((m) => m.clickChange < 0)
      .sort((a, b) => a.clickChange - b.clickChange)
      .slice(0, limit),
  }
}

// ── Countries ────────────────────────────────────────────────────────

const COUNTRY_ALPHA2: Record<string, string> = {
  tur: 'TR', deu: 'DE', usa: 'US', gbr: 'GB', nld: 'NL', fra: 'FR', aze: 'AZ', cyp: 'CY', bgr: 'BG', aut: 'AT',
  bel: 'BE', che: 'CH', ita: 'IT', esp: 'ES', rou: 'RO', grc: 'GR', rus: 'RU', ukr: 'UA', irl: 'IE', swe: 'SE',
  dnk: 'DK', nor: 'NO', pol: 'PL', can: 'CA', are: 'AE', sau: 'SA', kaz: 'KZ', geo: 'GE', irq: 'IQ', ind: 'IN',
}

/** Search Console country code ("tur") → Turkish name ("Türkiye"); the upper-cased code when unknown */
export function countryName(code: string): string {
  const alpha2 = COUNTRY_ALPHA2[code.toLowerCase()]
  if (!alpha2) return code.toUpperCase()
  try {
    return new Intl.DisplayNames(['tr'], { type: 'region' }).of(alpha2) ?? code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}
