/**
 * Meta Marketing API: what an admin may ask for and the exact request that follows.
 * Pure functions (no network, no environment) so the rules are testable:
 *
 * - Everything is created PAUSED. Going live is a separate, confirmed step (see the service).
 * - Budgets are in lira here; Meta wants the currency's smallest unit (kuruş), so ×100.
 * - A daily budget above the configured cap is refused, so a typo cannot spend real money.
 * - The ad's landing page must be on the shop's own site.
 */

export const OBJECTIVES = [
  { value: 'OUTCOME_TRAFFIC', label: 'Trafik (siteye ziyaretçi)' },
  { value: 'OUTCOME_SALES', label: 'Satış (alışveriş dönüşümü)' },
  { value: 'OUTCOME_AWARENESS', label: 'Bilinirlik (erişim)' },
] as const
export type Objective = (typeof OBJECTIVES)[number]['value']

export const PLACEMENTS = [
  { value: 'instagram_feed', label: 'Instagram Akış', platform: 'instagram', key: 'instagram_positions', position: 'stream' },
  { value: 'instagram_stories', label: 'Instagram Hikâyeler', platform: 'instagram', key: 'instagram_positions', position: 'story' },
  { value: 'instagram_reels', label: 'Instagram Reels', platform: 'instagram', key: 'instagram_positions', position: 'reels' },
  { value: 'facebook_feed', label: 'Facebook Akış', platform: 'facebook', key: 'facebook_positions', position: 'feed' },
  { value: 'facebook_stories', label: 'Facebook Hikâyeler', platform: 'facebook', key: 'facebook_positions', position: 'story' },
  { value: 'facebook_marketplace', label: 'Facebook Marketplace', platform: 'facebook', key: 'facebook_positions', position: 'marketplace' },
] as const
export type PlacementValue = (typeof PLACEMENTS)[number]['value']

export const CTAS = [
  { value: 'SHOP_NOW', label: 'Şimdi Alışveriş Yap' },
  { value: 'LEARN_MORE', label: 'Daha Fazla Bilgi' },
  { value: 'SEE_MORE', label: 'Daha Fazlasını Gör' },
  { value: 'ORDER_NOW', label: 'Şimdi Sipariş Ver' },
  { value: 'GET_OFFER', label: 'Teklifi Al' },
] as const
export type CtaValue = (typeof CTAS)[number]['value']

export type Gender = 'all' | 'male' | 'female'

export interface CampaignInput {
  name: string
  objective: Objective
  /** Campaign budget (lira per day). Leave empty to set the budget on each ad set instead. */
  dailyBudget?: number | null
}

export interface AdSetInput {
  campaignId: string
  name: string
  /** Of the campaign: decides the optimisation goal, and whether the budget sits here or on the campaign */
  objective: Objective
  campaignHasBudget: boolean
  dailyBudget?: number | null
  lifetimeBudget?: number | null
  /** ISO; defaults to "now" on Meta's side */
  startTime?: string | null
  endTime?: string | null
  countries?: string[]
  ageMin?: number
  ageMax?: number
  gender?: Gender
  /** Empty = automatic placements (Advantage+) */
  placements?: PlacementValue[]
  customAudienceIds?: string[]
  /** Let Meta widen the audience when it finds better people */
  advantageAudience?: boolean
}

export interface AdInput {
  adSetId: string
  name: string
  imageUrl?: string | null
  imageHash?: string | null
  primaryText: string
  headline: string
  description?: string | null
  cta: CtaValue
  landingUrl: string
}

export interface BuildContext {
  /** Highest daily budget (lira) that may be set */
  maxDailyBudget: number
  pixelId: string
  pageId: string
  instagramUserId?: string
  /** Hosts a landing page may be on */
  siteHosts: string[]
}

export class MetaAdsInputError extends Error {}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** Lira → kuruş, as the whole-number string Meta expects */
export function toMinorUnits(lira: number): string {
  return String(Math.round(lira * 100))
}

function checkBudget(label: string, value: number | null | undefined, max: number, errors: string[]): void {
  if (value === null || value === undefined) return
  if (!Number.isFinite(value) || value < 1) errors.push(`${label} en az 1 ₺ olmalı.`)
  else if (value > max) errors.push(`${label} en fazla ${max.toLocaleString('tr-TR')} ₺ olabilir (güvenlik sınırı).`)
}

function fail(errors: string[]): never {
  throw new MetaAdsInputError(errors.join(' '))
}

export function buildCampaign(input: CampaignInput, ctx: BuildContext): Record<string, unknown> {
  const errors: string[] = []
  const name = text(input.name)
  if (name.length < 3 || name.length > 200) errors.push('Kampanya adı 3–200 karakter olmalı.')
  if (!OBJECTIVES.some((o) => o.value === input.objective)) errors.push('Geçersiz kampanya amacı.')
  checkBudget('Günlük bütçe', input.dailyBudget, ctx.maxDailyBudget, errors)
  if (errors.length) fail(errors)

  const payload: Record<string, unknown> = {
    name,
    objective: input.objective,
    status: 'PAUSED',
    special_ad_categories: [],
    // Budgets are set on the ad sets unless the campaign carries one
    is_adset_budget_sharing_enabled: false,
  }
  if (input.dailyBudget) {
    payload.daily_budget = toMinorUnits(input.dailyBudget)
    payload.bid_strategy = 'LOWEST_COST_WITHOUT_CAP'
  }
  return payload
}

/** Optimisation goal and, for sales, what counts as a result */
export function optimisationFor(objective: Objective, pixelId: string): Record<string, unknown> {
  switch (objective) {
    case 'OUTCOME_SALES':
      return { optimization_goal: 'OFFSITE_CONVERSIONS', billing_event: 'IMPRESSIONS', promoted_object: { pixel_id: pixelId, custom_event_type: 'PURCHASE' } }
    case 'OUTCOME_AWARENESS':
      return { optimization_goal: 'REACH', billing_event: 'IMPRESSIONS' }
    default:
      return { optimization_goal: 'LANDING_PAGE_VIEWS', billing_event: 'IMPRESSIONS', destination_type: 'WEBSITE' }
  }
}

export function buildTargeting(input: AdSetInput): Record<string, unknown> {
  const targeting: Record<string, unknown> = {
    geo_locations: { countries: (input.countries?.length ? input.countries : ['TR']).map((c) => c.toUpperCase()) },
    age_min: input.ageMin ?? 18,
    age_max: input.ageMax ?? 65,
    targeting_automation: { advantage_audience: input.advantageAudience ? 1 : 0 },
  }
  if (input.gender === 'male') targeting.genders = [1]
  if (input.gender === 'female') targeting.genders = [2]
  if (input.customAudienceIds?.length) targeting.custom_audiences = input.customAudienceIds.map((id) => ({ id }))

  const chosen = PLACEMENTS.filter((p) => input.placements?.includes(p.value))
  if (chosen.length) {
    targeting.publisher_platforms = [...new Set(chosen.map((p) => p.platform))]
    for (const p of chosen) {
      const list = (targeting[p.key] as string[] | undefined) ?? []
      targeting[p.key] = [...list, p.position]
    }
  }
  return targeting
}

export function buildAdSet(input: AdSetInput, ctx: BuildContext): Record<string, unknown> {
  const errors: string[] = []
  const name = text(input.name)
  if (!input.campaignId) errors.push('Kampanya seçilmedi.')
  if (name.length < 3 || name.length > 200) errors.push('Reklam seti adı 3–200 karakter olmalı.')
  if (input.objective === 'OUTCOME_SALES' && !ctx.pixelId) errors.push('Satış amacı için Meta Pixel kimliği (META_PIXEL_ID) gerekli.')
  const ageMin = input.ageMin ?? 18
  const ageMax = input.ageMax ?? 65
  if (!Number.isInteger(ageMin) || !Number.isInteger(ageMax) || ageMin < 13 || ageMax > 65 || ageMin > ageMax) {
    errors.push('Yaş aralığı 13–65 arasında ve en küçük yaş en büyükten fazla olmayacak şekilde olmalı.')
  }
  for (const c of input.countries ?? []) if (!/^[A-Za-z]{2}$/.test(c)) errors.push('Ülke kodu 2 harf olmalı (ör. TR).')

  if (input.campaignHasBudget) {
    if (input.dailyBudget || input.lifetimeBudget) errors.push('Bütçe kampanyada tanımlı; reklam setinde ayrıca bütçe girilmez.')
  } else {
    if (!input.dailyBudget && !input.lifetimeBudget) errors.push('Günlük veya toplam bütçe girin.')
    if (input.dailyBudget && input.lifetimeBudget) errors.push('Günlük ve toplam bütçeden yalnızca biri seçilir.')
    checkBudget('Günlük bütçe', input.dailyBudget, ctx.maxDailyBudget, errors)
    checkBudget('Toplam bütçe', input.lifetimeBudget, ctx.maxDailyBudget * 30, errors)
    if (input.lifetimeBudget && !input.endTime) errors.push('Toplam bütçe için bitiş tarihi gerekli.')
  }
  const start = input.startTime ? Date.parse(input.startTime) : null
  const end = input.endTime ? Date.parse(input.endTime) : null
  if (input.startTime && Number.isNaN(start)) errors.push('Başlangıç tarihi geçersiz.')
  if (input.endTime && Number.isNaN(end)) errors.push('Bitiş tarihi geçersiz.')
  if (start && end && end <= start) errors.push('Bitiş tarihi başlangıçtan sonra olmalı.')
  if (errors.length) fail(errors)

  const payload: Record<string, unknown> = {
    name,
    campaign_id: input.campaignId,
    status: 'PAUSED',
    ...optimisationFor(input.objective, ctx.pixelId),
    targeting: buildTargeting(input),
  }
  if (!input.campaignHasBudget) {
    payload.bid_strategy = 'LOWEST_COST_WITHOUT_CAP'
    if (input.dailyBudget) payload.daily_budget = toMinorUnits(input.dailyBudget)
    if (input.lifetimeBudget) payload.lifetime_budget = toMinorUnits(input.lifetimeBudget)
  }
  if (input.startTime) payload.start_time = new Date(input.startTime).toISOString()
  if (input.endTime) payload.end_time = new Date(input.endTime).toISOString()
  return payload
}

/** The landing page with ad-tracking parameters Meta fills in per campaign and ad (feeds attribution); ids, not names, so a renamed campaign still matches */
export const URL_TAGS = 'utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.id}}&utm_term={{adset.id}}&utm_content={{ad.id}}'

export function landingUrlProblem(raw: string, siteHosts: string[]): string | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return 'Açılış adresi geçerli bir bağlantı olmalı.'
  }
  if (url.protocol !== 'https:') return 'Açılış adresi https ile başlamalı.'
  if (!siteHosts.includes(url.hostname.toLowerCase())) return `Açılış adresi sitenizde olmalı (${siteHosts.join(', ')}).`
  return null
}

export function buildCreative(input: AdInput, ctx: BuildContext): Record<string, unknown> {
  const errors: string[] = []
  if (!ctx.pageId) errors.push('Reklam yayınlamak için Facebook Sayfa kimliği (META_PAGE_ID) gerekli.')
  const name = text(input.name)
  const message = text(input.primaryText)
  const headline = text(input.headline)
  if (!input.adSetId) errors.push('Reklam seti seçilmedi.')
  if (name.length < 3 || name.length > 200) errors.push('Reklam adı 3–200 karakter olmalı.')
  if (!message || message.length > 2000) errors.push('Ana metin 1–2000 karakter olmalı.')
  if (!headline || headline.length > 100) errors.push('Başlık 1–100 karakter olmalı.')
  if ((input.description ?? '').length > 200) errors.push('Açıklama en fazla 200 karakter olmalı.')
  if (!CTAS.some((c) => c.value === input.cta)) errors.push('Geçersiz eylem düğmesi.')
  const imageUrl = text(input.imageUrl)
  const imageHash = text(input.imageHash)
  if (!imageUrl && !imageHash) errors.push('Bir görsel seçin.')
  if (imageUrl && !/^https:\/\//i.test(imageUrl)) errors.push('Görsel adresi https ile başlamalı.')
  const urlProblem = landingUrlProblem(text(input.landingUrl), ctx.siteHosts)
  if (urlProblem) errors.push(urlProblem)
  if (errors.length) fail(errors)

  const linkData: Record<string, unknown> = {
    link: text(input.landingUrl),
    message,
    name: headline,
    call_to_action: { type: input.cta, value: { link: text(input.landingUrl) } },
  }
  if (text(input.description)) linkData.description = text(input.description)
  if (imageHash) linkData.image_hash = imageHash
  else linkData.picture = imageUrl

  const spec: Record<string, unknown> = { page_id: ctx.pageId, link_data: linkData }
  if (ctx.instagramUserId) spec.instagram_user_id = ctx.instagramUserId
  return { name, object_story_spec: spec, url_tags: URL_TAGS }
}

export function buildAd(input: AdInput, creativeId: string): Record<string, unknown> {
  return { name: text(input.name), adset_id: input.adSetId, creative: { creative_id: creativeId }, status: 'PAUSED' }
}

/** Meta's own error text, in a form worth showing */
export function describeGraphError(error: { message?: string; error_user_title?: string; error_user_msg?: string; code?: number } | null | undefined): string {
  if (!error) return 'Meta isteği reddetti.'
  const detail = error.error_user_msg || error.message || 'Bilinmeyen hata'
  const title = error.error_user_title ? `${error.error_user_title}: ` : ''
  return `Meta: ${title}${detail}${error.code ? ` (kod ${error.code})` : ''}`
}
