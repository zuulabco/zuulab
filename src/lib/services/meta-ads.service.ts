import 'server-only'
import { DEFAULT_GRAPH_VERSION, getMetaPixelId } from '@/lib/marketing/meta-config'
import { logAuditEvent } from '@/lib/services/admin.service'
import {
  MetaAdsInputError,
  buildAd,
  buildAdSet,
  buildCampaign,
  buildCreative,
  describeGraphError,
  type AdInput,
  type AdSetInput,
  type BuildContext,
  type CampaignInput,
} from '@/lib/meta-ads/builders'

/**
 * Meta Marketing API for the admin's Pazarlama → Meta page.
 *
 * Safety rules, enforced here and not only in the screens:
 * - Everything created starts PAUSED (builders.ts). Going live only through setStatus with `confirm`.
 * - Only objects of the configured ad account can be changed (checked before every status change).
 * - A validate-only call asks Meta to check a request without creating anything.
 * - Every write is recorded in the audit log. The access token never leaves this file.
 *
 *   META_ADS_ACCESS_TOKEN   system-user token with ads_management + ads_read (secret)
 *   META_AD_ACCOUNT_ID      the ad account (with or without the "act_" prefix)
 *   META_PAGE_ID            Facebook Page the ads are published as (needed to create ads)
 *   META_INSTAGRAM_ACTOR_ID optional Instagram account for the ads
 *   META_ADS_MAX_DAILY_BUDGET  highest daily budget in lira the panel accepts (default 1000)
 */

export class MetaAdsError extends Error {}

const clean = (v: string | undefined) => (v ?? '').trim().replace(/^["']+|["']+$/g, '').trim()
const TIMEOUT_MS = 25_000

interface AdsConfig {
  token: string
  accountId: string
  pageId: string
  instagramActorId: string
  graphVersion: string
  maxDailyBudget: number
}

function config(): AdsConfig | null {
  const token = clean(process.env.META_ADS_ACCESS_TOKEN)
  const raw = clean(process.env.META_AD_ACCOUNT_ID).replace(/^act_/, '')
  if (!token || !/^\d{5,20}$/.test(raw)) return null
  const max = Number(clean(process.env.META_ADS_MAX_DAILY_BUDGET))
  return {
    token,
    accountId: `act_${raw}`,
    pageId: clean(process.env.META_PAGE_ID),
    instagramActorId: clean(process.env.META_INSTAGRAM_ACTOR_ID),
    graphVersion: clean(process.env.META_GRAPH_VERSION) || DEFAULT_GRAPH_VERSION,
    maxDailyBudget: Number.isFinite(max) && max > 0 ? max : 1000,
  }
}

function need(): AdsConfig {
  const c = config()
  if (!c) throw new MetaAdsError('Meta reklam bağlantısı kurulu değil (META_ADS_ACCESS_TOKEN, META_AD_ACCOUNT_ID).')
  return c
}

function context(c: AdsConfig): BuildContext {
  const hosts = new Set(['zuulab.com', 'www.zuulab.com'])
  try {
    const site = process.env.NEXT_PUBLIC_SITE_URL
    if (site) hosts.add(new URL(site).hostname.toLowerCase())
  } catch {
    // keep the defaults
  }
  return { maxDailyBudget: c.maxDailyBudget, pixelId: getMetaPixelId(), pageId: c.pageId, instagramActorId: c.instagramActorId || undefined, siteHosts: [...hosts] }
}

type Json = Record<string, unknown>

async function graph<T = Json>(c: AdsConfig, method: 'GET' | 'POST', path: string, params: Json = {}): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${c.graphVersion}/${path}`)
  const body = new URLSearchParams()
  const target = method === 'GET' ? url.searchParams : body
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue
    target.set(k, typeof v === 'string' ? v : JSON.stringify(v))
  }
  // The token goes in the header, never in a URL that could be logged
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${c.token}`, ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      body: method === 'POST' ? body : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch {
    throw new MetaAdsError('Meta’ya ulaşılamadı, biraz sonra tekrar deneyin.')
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: Parameters<typeof describeGraphError>[0] }) | null
  if (!res.ok || (data && 'error' in data && data.error)) throw new MetaAdsError(describeGraphError(data?.error))
  return data as T
}

const VALIDATE = { execution_options: ['validate_only'] }

// ── Reading ──────────────────────────────────────────────────────────

export interface MetaSetup {
  configured: boolean
  account?: { id: string; name: string; status: string; currency: string; timezone: string; spentToDate: number }
  pixel: { configured: boolean; inAccount: boolean | null }
  pageConfigured: boolean
  maxDailyBudget: number
  problem?: string
}

const ACCOUNT_STATUS: Record<number, string> = { 1: 'Aktif', 2: 'Devre dışı', 3: 'Ödeme sorunu', 7: 'İnceleniyor', 9: 'Ek süre', 101: 'Kapalı' }

export async function getSetup(): Promise<MetaSetup> {
  const c = config()
  const pixelId = getMetaPixelId()
  if (!c) return { configured: false, pixel: { configured: Boolean(pixelId), inAccount: null }, pageConfigured: false, maxDailyBudget: 1000 }
  try {
    const [acc, pixels] = await Promise.all([
      graph<Json>(c, 'GET', c.accountId, { fields: 'name,account_status,currency,timezone_name,amount_spent' }),
      graph<{ data?: Array<{ id: string }> }>(c, 'GET', `${c.accountId}/adspixels`, { fields: 'id', limit: '25' }),
    ])
    return {
      configured: true,
      account: {
        id: c.accountId,
        name: String(acc.name ?? ''),
        status: ACCOUNT_STATUS[Number(acc.account_status)] ?? `Durum ${acc.account_status}`,
        currency: String(acc.currency ?? ''),
        timezone: String(acc.timezone_name ?? ''),
        // Meta reports the lifetime spend in the smallest currency unit
        spentToDate: Number(acc.amount_spent ?? 0) / 100,
      },
      pixel: { configured: Boolean(pixelId), inAccount: pixelId ? (pixels.data ?? []).some((p) => p.id === pixelId) : null },
      pageConfigured: Boolean(c.pageId),
      maxDailyBudget: c.maxDailyBudget,
    }
  } catch (e) {
    return { configured: true, pixel: { configured: Boolean(pixelId), inAccount: null }, pageConfigured: Boolean(c.pageId), maxDailyBudget: c.maxDailyBudget, problem: (e as Error).message }
  }
}

export interface MetaAd {
  id: string
  name: string
  status: string
  effectiveStatus: string
}
export interface MetaAdSet {
  id: string
  name: string
  status: string
  effectiveStatus: string
  dailyBudget: number | null
  lifetimeBudget: number | null
  ads: MetaAd[]
}
export interface MetaCampaign {
  id: string
  name: string
  objective: string
  status: string
  effectiveStatus: string
  dailyBudget: number | null
  adSets: MetaAdSet[]
}

const lira = (v: unknown) => (v === undefined || v === null || v === '' ? null : Number(v) / 100)

export async function listCampaigns(): Promise<MetaCampaign[]> {
  const c = need()
  const camps = await graph<{ data?: Json[] }>(c, 'GET', `${c.accountId}/campaigns`, {
    fields: 'name,objective,status,effective_status,daily_budget',
    limit: '100',
  })
  const sets = await graph<{ data?: Json[] }>(c, 'GET', `${c.accountId}/adsets`, {
    fields: 'name,status,effective_status,daily_budget,lifetime_budget,campaign_id',
    limit: '200',
  })
  const ads = await graph<{ data?: Json[] }>(c, 'GET', `${c.accountId}/ads`, {
    fields: 'name,status,effective_status,adset_id',
    limit: '300',
  })
  return (camps.data ?? []).map((cp) => ({
    id: String(cp.id),
    name: String(cp.name),
    objective: String(cp.objective ?? ''),
    status: String(cp.status),
    effectiveStatus: String(cp.effective_status ?? cp.status),
    dailyBudget: lira(cp.daily_budget),
    adSets: (sets.data ?? [])
      .filter((s) => s.campaign_id === cp.id)
      .map((s) => ({
        id: String(s.id),
        name: String(s.name),
        status: String(s.status),
        effectiveStatus: String(s.effective_status ?? s.status),
        dailyBudget: lira(s.daily_budget),
        lifetimeBudget: lira(s.lifetime_budget),
        ads: (ads.data ?? [])
          .filter((a) => a.adset_id === s.id)
          .map((a) => ({ id: String(a.id), name: String(a.name), status: String(a.status), effectiveStatus: String(a.effective_status ?? a.status) })),
      })),
  }))
}

export async function listAudiences(): Promise<Array<{ id: string; name: string; size: number | null }>> {
  const c = need()
  const res = await graph<{ data?: Json[] }>(c, 'GET', `${c.accountId}/customaudiences`, { fields: 'name,approximate_count_lower_bound', limit: '100' })
  return (res.data ?? []).map((a) => ({ id: String(a.id), name: String(a.name), size: a.approximate_count_lower_bound ? Number(a.approximate_count_lower_bound) : null }))
}

export async function listImages(): Promise<Array<{ hash: string; name: string; url: string }>> {
  const c = need()
  const res = await graph<{ data?: Json[] }>(c, 'GET', `${c.accountId}/adimages`, { fields: 'hash,name,url_128', limit: '50' })
  return (res.data ?? []).map((i) => ({ hash: String(i.hash), name: String(i.name ?? ''), url: String(i.url_128 ?? '') }))
}

// ── Creating (always PAUSED) ─────────────────────────────────────────

export interface CreateResult {
  id?: string
  /** True when only validated: nothing was created */
  validated: boolean
}

async function audit(action: string, entityId: string | null, metadata: Json) {
  await logAuditEvent({ action, entity: 'MetaAds', entityId, metadata })
}

export async function createCampaign(input: CampaignInput, by: string, validateOnly = false): Promise<CreateResult> {
  const c = need()
  const payload = buildCampaign(input, context(c))
  if (validateOnly) {
    await graph(c, 'POST', `${c.accountId}/campaigns`, { ...payload, ...VALIDATE })
    return { validated: true }
  }
  const res = await graph<{ id: string }>(c, 'POST', `${c.accountId}/campaigns`, payload)
  await audit('META_CAMPAIGN_CREATED', res.id, { name: payload.name, objective: payload.objective, by })
  return { id: res.id, validated: false }
}

export async function createAdSet(input: AdSetInput, by: string, validateOnly = false): Promise<CreateResult> {
  const c = need()
  await assertOwned(c, input.campaignId)
  const payload = buildAdSet(input, context(c))
  if (validateOnly) {
    await graph(c, 'POST', `${c.accountId}/adsets`, { ...payload, ...VALIDATE })
    return { validated: true }
  }
  const res = await graph<{ id: string }>(c, 'POST', `${c.accountId}/adsets`, payload)
  await audit('META_ADSET_CREATED', res.id, { name: payload.name, campaignId: input.campaignId, by })
  return { id: res.id, validated: false }
}

export async function createAd(input: AdInput, by: string, validateOnly = false): Promise<CreateResult> {
  const c = need()
  await assertOwned(c, input.adSetId)
  const creative = buildCreative(input, context(c))
  if (validateOnly) {
    await graph(c, 'POST', `${c.accountId}/adcreatives`, { ...creative, ...VALIDATE })
    return { validated: true }
  }
  const made = await graph<{ id: string }>(c, 'POST', `${c.accountId}/adcreatives`, creative)
  const res = await graph<{ id: string }>(c, 'POST', `${c.accountId}/ads`, buildAd(input, made.id))
  await audit('META_AD_CREATED', res.id, { name: input.name, adSetId: input.adSetId, creativeId: made.id, by })
  return { id: res.id, validated: false }
}

// ── Going live / pausing ─────────────────────────────────────────────

/** The object must belong to the configured ad account; stops a pasted id from touching someone else's */
async function assertOwned(c: AdsConfig, objectId: string): Promise<void> {
  if (!/^\d{5,25}$/.test(objectId)) throw new MetaAdsInputError('Geçersiz kimlik.')
  const obj = await graph<{ account_id?: string }>(c, 'GET', objectId, { fields: 'account_id' })
  if (`act_${obj.account_id}` !== c.accountId) throw new MetaAdsInputError('Bu öğe bağlı reklam hesabına ait değil.')
}

export async function setStatus(id: string, status: 'ACTIVE' | 'PAUSED', by: string, confirmed: boolean): Promise<void> {
  const c = need()
  if (status === 'ACTIVE' && !confirmed) throw new MetaAdsInputError('Yayına almak için onay gerekli.')
  await assertOwned(c, id)
  await graph(c, 'POST', id, { status })
  await audit(status === 'ACTIVE' ? 'META_ENTITY_ACTIVATED' : 'META_ENTITY_PAUSED', id, { by })
}
