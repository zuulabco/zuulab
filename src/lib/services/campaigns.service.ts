import 'server-only'
import { db } from '@/prisma/db'
import { round2 } from '@/lib/pricing/money'
import { dbNumeric } from '@/lib/db/numeric'
import { dbTimestampToIso, toDbTimestamp } from '@/lib/db/time'
import { logAuditEvent } from './admin.service'

/**
 * Store-wide campaigns.
 *
 * A DISCOUNT campaign lowers every qualifying cart on its own, with no code:
 *   - PERCENTAGE / FIXED: money off the products (optionally only some categories)
 *   - FREE_SHIPPING: no delivery fee
 * Audience ALL means every cart; FIRST_ORDER means a signed-in customer who has not
 * paid for an order yet (a sign-up / welcome campaign).
 *
 * An ANNOUNCEMENT campaign changes no price; it only tells visitors about something
 * (a season, a coupon code to use).
 *
 * Either kind can be announced on the site as a pop-up (MODAL) or a ribbon (RIBBON).
 * When several discount campaigns fit a cart, the one saving the customer most wins.
 */

export type CampaignKind = 'DISCOUNT' | 'ANNOUNCEMENT'
export type CampaignDiscountType = 'PERCENTAGE' | 'FIXED' | 'FREE_SHIPPING'
export type CampaignAudience = 'ALL' | 'FIRST_ORDER'
export type CampaignDisplay = 'NONE' | 'MODAL' | 'RIBBON'

export interface CampaignItem {
  id: string
  name: string
  description: string | null
  kind: CampaignKind
  type: CampaignDiscountType
  discountValue: number
  maxDiscount: number | null
  minSubtotal: number | null
  audience: CampaignAudience
  categoryIds: string[]
  couponCode: string | null
  isActive: boolean
  startsAt: string | null
  endsAt: string | null
  display: CampaignDisplay
  headline: string | null
  message: string | null
  ctaLabel: string | null
  ctaHref: string | null
  imageUrl: string | null
  priority: number
  /** Orders that used this campaign's discount */
  orderCount: number
  updatedAt: string | null
}

export interface CampaignInput {
  name: string
  description?: string | null
  kind: CampaignKind
  type: CampaignDiscountType
  discountValue?: number | null
  maxDiscount?: number | null
  minSubtotal?: number | null
  audience?: CampaignAudience
  categoryIds?: string[]
  couponCode?: string | null
  isActive?: boolean
  startsAt?: string | null
  endsAt?: string | null
  display?: CampaignDisplay
  headline?: string | null
  message?: string | null
  ctaLabel?: string | null
  ctaHref?: string | null
  imageUrl?: string | null
  priority?: number
}

export class CampaignValidationError extends Error {
  readonly isValidation = true
}

const KINDS = new Set<CampaignKind>(['DISCOUNT', 'ANNOUNCEMENT'])
const TYPES = new Set<CampaignDiscountType>(['PERCENTAGE', 'FIXED', 'FREE_SHIPPING'])
const AUDIENCES = new Set<CampaignAudience>(['ALL', 'FIRST_ORDER'])
const DISPLAYS = new Set<CampaignDisplay>(['NONE', 'MODAL', 'RIBBON'])
const PAID_STATUSES = ['PAYMENT_RECEIVED', 'CONFIRMED', 'PREPARING', 'IN_PRODUCTION', 'PACKING', 'SHIPPED', 'DELIVERED']

type CampaignRow = Awaited<ReturnType<typeof loadRows>>[number]

function loadRows() {
  return db.orm.public.Campaign.orderBy([(c) => c.priority.desc(), (c) => c.createdAt.desc()]).all()
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function text(value: unknown, max = 500): string | null {
  const s = String(value ?? '').trim()
  return s ? s.slice(0, max) : null
}

function toItem(row: CampaignRow, categoryIds: string[], orderCount: number): CampaignItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    kind: (KINDS.has(row.kind as CampaignKind) ? row.kind : 'DISCOUNT') as CampaignKind,
    type: (TYPES.has(row.type as CampaignDiscountType) ? row.type : 'PERCENTAGE') as CampaignDiscountType,
    discountValue: Number(row.discountValue ?? 0),
    maxDiscount: num(row.maxDiscount),
    minSubtotal: num(row.minSubtotal),
    audience: (AUDIENCES.has(row.audience as CampaignAudience) ? row.audience : 'ALL') as CampaignAudience,
    categoryIds,
    couponCode: row.couponCode ?? null,
    isActive: row.isActive,
    startsAt: dbTimestampToIso(row.startsAt),
    endsAt: dbTimestampToIso(row.endsAt),
    display: (DISPLAYS.has(row.display as CampaignDisplay) ? row.display : 'NONE') as CampaignDisplay,
    headline: row.headline ?? null,
    message: row.message ?? null,
    ctaLabel: row.ctaLabel ?? null,
    ctaHref: row.ctaHref ?? null,
    imageUrl: row.bannerImage ?? null,
    priority: row.priority,
    orderCount,
    updatedAt: dbTimestampToIso(row.updatedAt),
  }
}

async function loadCampaigns(): Promise<CampaignItem[]> {
  const [rows, cats, usage] = await Promise.all([
    loadRows(),
    db.orm.public.CampaignCategory.all(),
    db.orm.public.Order.where((o) => o.campaignId.isNotNull()).groupBy('campaignId').aggregate((a) => ({ count: a.count() })),
  ])
  const catsBy = new Map<string, string[]>()
  for (const c of cats) catsBy.set(c.campaignId, [...(catsBy.get(c.campaignId) ?? []), c.categoryId])
  const usedBy = new Map((usage as Array<{ campaignId: string | null; count: number }>).map((u) => [u.campaignId, Number(u.count)]))
  return rows.map((r) => toItem(r, catsBy.get(r.id) ?? [], usedBy.get(r.id) ?? 0))
}

function isRunning(c: CampaignItem, now = Date.now()): boolean {
  if (!c.isActive) return false
  if (c.startsAt && new Date(c.startsAt).getTime() > now) return false
  if (c.endsAt && new Date(c.endsAt).getTime() < now) return false
  return true
}

// ── Admin ────────────────────────────────────────────────────

export async function adminListCampaigns(): Promise<CampaignItem[]> {
  return loadCampaigns()
}

function columns(input: CampaignInput) {
  const name = text(input.name, 120)
  if (!name || name.length < 2) throw new CampaignValidationError('Kampanya adı en az 2 karakter olmalıdır.')
  const kind: CampaignKind = KINDS.has(input.kind) ? input.kind : 'DISCOUNT'
  const type: CampaignDiscountType = TYPES.has(input.type) ? input.type : 'PERCENTAGE'
  const value = num(input.discountValue) ?? 0
  if (kind === 'DISCOUNT' && type !== 'FREE_SHIPPING') {
    if (value <= 0) throw new CampaignValidationError('İndirim tutarı 0’dan büyük olmalıdır.')
    if (type === 'PERCENTAGE' && value > 90) throw new CampaignValidationError('Yüzde indirim en fazla %90 olabilir.')
  }
  const startsAt = input.startsAt ? new Date(input.startsAt) : null
  const endsAt = input.endsAt ? new Date(input.endsAt) : null
  if (startsAt && Number.isNaN(startsAt.getTime())) throw new CampaignValidationError('Başlangıç tarihi geçersiz.')
  if (endsAt && Number.isNaN(endsAt.getTime())) throw new CampaignValidationError('Bitiş tarihi geçersiz.')
  if (startsAt && endsAt && endsAt <= startsAt) throw new CampaignValidationError('Bitiş tarihi başlangıçtan sonra olmalıdır.')
  const ctaHref = text(input.ctaHref, 300)
  if (ctaHref && !ctaHref.startsWith('/') && !/^https:\/\//.test(ctaHref)) {
    throw new CampaignValidationError('Bağlantı / ile başlamalı (site içi) ya da https:// olmalıdır.')
  }
  const display: CampaignDisplay = input.display && DISPLAYS.has(input.display) ? input.display : 'NONE'
  const headline = text(input.headline, 120)
  if (display !== 'NONE' && !headline) throw new CampaignValidationError('Sitede gösterilecek kampanyanın bir başlığı olmalıdır.')

  const max = num(input.maxDiscount)
  const min = num(input.minSubtotal)
  return {
    name,
    description: text(input.description),
    kind,
    type: type as never,
    discountValue: dbNumeric(round2(type === 'FREE_SHIPPING' ? 0 : value), 2),
    maxDiscount: max !== null && max > 0 ? dbNumeric(round2(max), 2) : null,
    minSubtotal: min !== null && min > 0 ? dbNumeric(round2(min), 2) : null,
    audience: input.audience && AUDIENCES.has(input.audience) ? input.audience : 'ALL',
    couponCode: text(input.couponCode, 30)?.toUpperCase() ?? null,
    isActive: input.isActive ?? true,
    startsAt: startsAt ? toDbTimestamp(startsAt) : null,
    endsAt: endsAt ? toDbTimestamp(endsAt) : null,
    display,
    headline,
    message: text(input.message, 400),
    ctaLabel: text(input.ctaLabel, 40),
    ctaHref,
    bannerImage: text(input.imageUrl, 500),
    priority: Math.round(num(input.priority) ?? 0),
  }
}

async function setCategories(campaignId: string, categoryIds: string[] | undefined) {
  if (categoryIds === undefined) return
  const ids = [...new Set(categoryIds.filter(Boolean))]
  await db.runtime().execute(db.raw.sql`DELETE FROM campaign_categories WHERE campaign_id = ${campaignId}`.affectedCount().build())
  for (const categoryId of ids) {
    await db.orm.public.CampaignCategory.create({ campaignId, categoryId })
  }
}

export async function adminCreateCampaign(input: CampaignInput, adminEmail = 'system'): Promise<CampaignItem> {
  const created = await db.orm.public.Campaign.create(columns(input) as never)
  await setCategories(created.id, input.categoryIds ?? [])
  await logAuditEvent({ action: 'CAMPAIGN_CREATED', entity: 'Campaign', entityId: created.id, metadata: { name: input.name, adminEmail } })
  return (await loadCampaigns()).find((c) => c.id === created.id)!
}

export async function adminUpdateCampaign(id: string, input: CampaignInput, adminEmail = 'system'): Promise<CampaignItem> {
  const existing = await db.orm.public.Campaign.where({ id }).first()
  if (!existing) throw new CampaignValidationError('Kampanya bulunamadı.')
  await db.orm.public.Campaign.where({ id }).update(columns(input) as never)
  await setCategories(id, input.categoryIds)
  await logAuditEvent({ action: 'CAMPAIGN_UPDATED', entity: 'Campaign', entityId: id, metadata: { name: input.name, adminEmail } })
  return (await loadCampaigns()).find((c) => c.id === id)!
}

export async function adminSetCampaignActive(id: string, isActive: boolean, adminEmail = 'system'): Promise<void> {
  await db.orm.public.Campaign.where({ id }).update({ isActive })
  await logAuditEvent({ action: 'CAMPAIGN_TOGGLED', entity: 'Campaign', entityId: id, metadata: { isActive, adminEmail } })
}

/** Orders keep their amounts; their link to the campaign is cleared. */
export async function adminDeleteCampaign(id: string, adminEmail = 'system'): Promise<void> {
  await db.orm.public.Campaign.where({ id }).delete()
  await logAuditEvent({ action: 'CAMPAIGN_DELETED', entity: 'Campaign', entityId: id, metadata: { adminEmail } })
}

// ── Checkout ─────────────────────────────────────────────────

export interface AppliedCampaign {
  id: string
  name: string
  type: CampaignDiscountType
  label: string
}

export interface CartCampaignResult {
  /** The product-discount campaign used (if any) */
  discountCampaign: AppliedCampaign | null
  discount: number
  /** A free-shipping campaign that applies (if any) */
  freeShippingCampaign: AppliedCampaign | null
}

async function hasPaidOrder(userId: string): Promise<boolean> {
  const row = await db.orm.public.Order.select('id')
    .where((o) => o.userId.eq(userId))
    .where((o) => o.status.in(PAID_STATUSES as never))
    .first()
  return Boolean(row)
}

function labelFor(c: CampaignItem): string {
  if (c.type === 'FREE_SHIPPING') return 'ücretsiz kargo'
  if (c.type === 'PERCENTAGE') return `%${c.discountValue} indirim`
  return `${c.discountValue} ₺ indirim`
}

/**
 * The campaigns a cart qualifies for right now, and what they take off.
 * `lines` are the priced cart lines with their category.
 */
export async function resolveCartCampaigns(params: {
  lines: Array<{ lineTotal: number; categoryId: string }>
  subtotal: number
  userId?: string | null
}): Promise<CartCampaignResult> {
  const none: CartCampaignResult = { discountCampaign: null, discount: 0, freeShippingCampaign: null }
  if (params.subtotal <= 0) return none

  const running = (await loadCampaigns()).filter((c) => c.kind === 'DISCOUNT' && isRunning(c))
  if (running.length === 0) return none

  let firstOrder: boolean | null = null
  const eligible: CampaignItem[] = []
  for (const c of running) {
    if (c.minSubtotal !== null && params.subtotal < c.minSubtotal) continue
    if (c.audience === 'FIRST_ORDER') {
      if (!params.userId) continue
      firstOrder ??= !(await hasPaidOrder(params.userId))
      if (!firstOrder) continue
    }
    eligible.push(c)
  }

  let best: { campaign: CampaignItem; discount: number } | null = null
  for (const c of eligible.filter((e) => e.type !== 'FREE_SHIPPING')) {
    const base =
      c.categoryIds.length > 0
        ? params.lines.filter((l) => c.categoryIds.includes(l.categoryId)).reduce((s, l) => s + l.lineTotal, 0)
        : params.subtotal
    if (base <= 0) continue
    let discount = c.type === 'PERCENTAGE' ? (base * c.discountValue) / 100 : Math.min(base, c.discountValue)
    if (c.maxDiscount !== null) discount = Math.min(discount, c.maxDiscount)
    discount = round2(Math.min(discount, params.subtotal))
    if (discount > 0 && (!best || discount > best.discount || (discount === best.discount && c.priority > best.campaign.priority))) {
      best = { campaign: c, discount }
    }
  }

  const freeShip = eligible.find((e) => e.type === 'FREE_SHIPPING') ?? null
  const applied = (c: CampaignItem): AppliedCampaign => ({ id: c.id, name: c.name, type: c.type, label: labelFor(c) })

  return {
    discountCampaign: best ? applied(best.campaign) : null,
    discount: best?.discount ?? 0,
    freeShippingCampaign: freeShip ? applied(freeShip) : null,
  }
}

// ── Storefront announcements ─────────────────────────────────

export interface PublicCampaign {
  id: string
  display: Exclude<CampaignDisplay, 'NONE'>
  headline: string
  message: string | null
  ctaLabel: string | null
  ctaHref: string | null
  couponCode: string | null
  imageUrl: string | null
  /** e.g. "%10 indirim" — for discount campaigns */
  label: string | null
  minSubtotal: number | null
  firstOrderOnly: boolean
  endsAt: string | null
  updatedAt: string | null
}

export async function getPublicCampaigns(): Promise<PublicCampaign[]> {
  return (await loadCampaigns())
    .filter((c) => c.display !== 'NONE' && c.headline && isRunning(c))
    .map((c) => ({
      id: c.id,
      display: c.display as PublicCampaign['display'],
      headline: c.headline!,
      message: c.message,
      ctaLabel: c.ctaLabel,
      ctaHref: c.ctaHref,
      couponCode: c.couponCode,
      imageUrl: c.imageUrl,
      label: c.kind === 'DISCOUNT' ? labelFor(c) : null,
      minSubtotal: c.minSubtotal,
      firstOrderOnly: c.audience === 'FIRST_ORDER',
      endsAt: c.endsAt,
      updatedAt: c.updatedAt,
    }))
}
