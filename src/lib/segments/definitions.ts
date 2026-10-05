/**
 * Customer and visitor segments: who they are, in words. The queries live in
 * services/segments.service.ts; this file holds only the definitions and the rules for
 * their settings, so the admin page and the tests share them.
 *
 * Two kinds:
 * - "customers": real people we know (they ordered); can be counted by e-mail permission.
 * - "visitors": anonymous visitors who accepted cookies; counted only, never named.
 */

export type SegmentKind = 'customers' | 'visitors'

export interface SegmentParam {
  key: 'minSpend' | 'days' | 'productId' | 'collectionSlug'
  label: string
  /** number or text */
  type: 'number' | 'text'
  default?: number
  min?: number
  max?: number
}

export interface SegmentDefinition {
  key: SegmentKey
  kind: SegmentKind
  label: string
  description: string
  params: SegmentParam[]
}

export const SEGMENT_KEYS = [
  'first_time_buyers',
  'repeat_buyers',
  'high_spenders',
  'recent_buyers',
  'inactive_customers',
  'product_buyers',
  'newsletter_subscribers',
  'cart_abandoners',
  'collection_viewers',
  'meta_ad_visitors',
] as const

export type SegmentKey = (typeof SEGMENT_KEYS)[number]

const DAYS = (def: number): SegmentParam => ({ key: 'days', label: 'Gün', type: 'number', default: def, min: 1, max: 365 })

export const SEGMENTS: SegmentDefinition[] = [
  { key: 'first_time_buyers', kind: 'customers', label: 'İlk kez alışveriş yapanlar', description: 'Şimdiye kadar yalnızca 1 sipariş vermiş müşteriler.', params: [] },
  { key: 'repeat_buyers', kind: 'customers', label: 'Tekrar alışveriş yapanlar', description: '2 veya daha fazla sipariş vermiş müşteriler.', params: [] },
  {
    key: 'high_spenders',
    kind: 'customers',
    label: 'Yüksek harcama yapanlar',
    description: 'Toplam harcaması belirlenen tutarın üstünde olan müşteriler.',
    params: [{ key: 'minSpend', label: 'En az harcama (₺)', type: 'number', default: 1000, min: 1, max: 1000000 }],
  },
  { key: 'recent_buyers', kind: 'customers', label: 'Son günlerde alışveriş yapanlar', description: 'Belirlenen gün içinde sipariş vermiş müşteriler.', params: [DAYS(30)] },
  {
    key: 'inactive_customers',
    kind: 'customers',
    label: 'Bir süredir alışveriş yapmayanlar',
    description: 'Daha önce sipariş vermiş ama belirlenen gündür yeni sipariş vermemiş müşteriler.',
    params: [DAYS(90)],
  },
  {
    key: 'product_buyers',
    kind: 'customers',
    label: 'Belirli bir ürünü alanlar',
    description: 'Seçilen ürünü satın almış müşteriler.',
    params: [{ key: 'productId', label: 'Ürün', type: 'text' }],
  },
  { key: 'newsletter_subscribers', kind: 'customers', label: 'Bülten aboneleri', description: 'E-postasını onaylayıp bültene katılmış kişiler.', params: [] },
  {
    key: 'cart_abandoners',
    kind: 'visitors',
    label: 'Sepete ekleyip almayanlar',
    description: 'Belirlenen gün içinde sepete ürün atıp satın almayan ziyaretçiler.',
    params: [DAYS(7)],
  },
  {
    key: 'collection_viewers',
    kind: 'visitors',
    label: 'Bir koleksiyona bakanlar',
    description: 'Seçilen koleksiyon sayfasını gezmiş ziyaretçiler.',
    params: [{ key: 'collectionSlug', label: 'Koleksiyon', type: 'text' }, DAYS(30)],
  },
  {
    key: 'meta_ad_visitors',
    kind: 'visitors',
    label: 'Meta (Facebook/Instagram) reklamından gelenler',
    description: 'Facebook veya Instagram bağlantısıyla siteye gelmiş ziyaretçiler.',
    params: [DAYS(30)],
  },
]

export const SEGMENT_BY_KEY: Record<SegmentKey, SegmentDefinition> = Object.fromEntries(SEGMENTS.map((s) => [s.key, s])) as Record<
  SegmentKey,
  SegmentDefinition
>

export function isSegmentKey(value: unknown): value is SegmentKey {
  return typeof value === 'string' && (SEGMENT_KEYS as readonly string[]).includes(value)
}

export type SegmentSettings = Partial<Record<SegmentParam['key'], number | string>>

export interface ResolvedSettings {
  minSpend: number
  days: number
  productId: string
  collectionSlug: string
}

/** Fills in defaults and keeps numbers inside their limits; text is trimmed and shortened. */
export function resolveSettings(key: SegmentKey, input: SegmentSettings = {}): ResolvedSettings {
  const out: ResolvedSettings = { minSpend: 1000, days: 30, productId: '', collectionSlug: '' }
  for (const p of SEGMENT_BY_KEY[key].params) {
    const raw = input[p.key]
    if (p.type === 'number') {
      const n = Number(raw)
      const base = Number.isFinite(n) && raw !== undefined && raw !== '' ? n : (p.default ?? 0)
      out[p.key as 'minSpend' | 'days'] = Math.min(p.max ?? Infinity, Math.max(p.min ?? 0, Math.round(base)))
    } else {
      out[p.key as 'productId' | 'collectionSlug'] = String(raw ?? '').trim().slice(0, 100)
    }
  }
  return out
}

/** The setting a segment still needs before it can be counted, if any */
export function missingSetting(key: SegmentKey, settings: ResolvedSettings): string | null {
  if (key === 'product_buyers' && !settings.productId) return 'Önce bir ürün seçin.'
  if (key === 'collection_viewers' && !settings.collectionSlug) return 'Önce bir koleksiyon seçin.'
  return null
}

