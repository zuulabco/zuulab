import 'server-only'
import { randomUUID } from 'node:crypto'
import { db } from '@/prisma/db'
import { SITE_URL } from '@/lib/config/urls'
import { dbTimestampToIso } from '@/lib/db/time'
import { logAuditEvent } from './admin.service'
import { getEmailProvider } from './notification/email-provider.factory'
import { renderEmailBase } from './notification/templates/email-base.template'
import type { EmailSendOptions } from './notification/notification.interface'
import { getSigningSecret } from './session.service'
import { COMMERCIAL_EMAIL_OFF_MESSAGE, commercialEmailEnabled } from '@/lib/email/policy'
import { countsByCampaign, emptyCounts, CampaignError } from './email-campaign.service'
import {
  AUTOMATIONS,
  ABANDONED_AFTER_HOURS,
  ABANDONED_REPEAT_DAYS,
  ABANDONED_UNTIL_HOURS,
  MIN_DAYS_BETWEEN_MAILS,
  REVIEW_AFTER_DAYS,
  REVIEW_UNTIL_DAYS,
  WIN_BACK_AFTER_DAYS,
  WIN_BACK_REPEAT_DAYS,
  WIN_BACK_UNTIL_DAYS,
  CROSS_SELL_AFTER_DAYS,
  CROSS_SELL_UNTIL_DAYS,
  RECOMMENDATION_COUNT,
  crossSellMail,
  winBackMail,
  abandonedPaymentMail,
  automationDef,
  inQuietHours,
  reviewRequestMail,
  signOptout,
  type AutomationDef,
  type AutomationKey,
  type AutomationMail,
  type MailItem,
  type Recommendation,
  type ReviewProduct,
} from '@/lib/email/automations'
import { campaignRates, escapeHtml, renderCampaignBody, type CampaignRates, type MessageCounts } from '@/lib/email/campaign'

/**
 * Automatic e-mails (Phase 9): a reminder for an unpaid order and a review request after delivery.
 *
 * Each automation is one row in email_campaigns (kind AUTOMATION, status ACTIVE or PAUSED, PAUSED
 * until the admin switches it on) and each mail is one row in email_messages, so the Resend webhook
 * and the statistics work exactly as for campaigns. A mail is claimed with one insert that the
 * database refuses to repeat for the same order, so a rule cannot mail an order twice even when two
 * runs overlap. The rules about restraint (3 days between mails, once a week for an unpaid order,
 * nothing at night) are in lib/email/automations.ts.
 */

type Rec = Record<string, unknown>
const run = <T = Rec>(query: unknown) => db.runtime().query(query as never) as unknown as Promise<T[]>
const exec = (query: unknown) => db.runtime().execute(query as never) as unknown as Promise<{ affectedRows: number }>
const int = (v: unknown) => Number(v ?? 0)

/** UTC wall clock as the database stores it */
const wall = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ')

// ── The automations as rows ──────────────────────────────────────────

export interface AutomationSummary extends AutomationDef {
  active: boolean
  counts: MessageCounts
  rates: CampaignRates
  lastSentAt: string | null
}

/** The row of an automation, created (paused) the first time it is needed */
export async function ensureAutomation(key: AutomationKey): Promise<{ id: string; active: boolean }> {
  const def = automationDef(key)
  if (!def) throw new CampaignError('Bilinmeyen otomasyon.')
  await exec(
    db.raw.sql`INSERT INTO email_campaigns (id, name, subject, content, status, kind, automation_key, created_at, updated_at)
               VALUES (${randomUUID()}, ${def.name}, ${def.name}, '{}'::jsonb, 'PAUSED', 'AUTOMATION', ${key}, now(), now())
               ON CONFLICT (automation_key) DO NOTHING`.affectedCount().build()
  )
  const [row] = await run<{ id: string; status: string }>(
    db.raw.sql`SELECT id, status FROM email_campaigns WHERE automation_key = ${key}`.returnsRow({ id: 'pg/text@1', status: 'pg/text@1' } as never).build()
  )
  return { id: String(row.id), active: row.status === 'ACTIVE' }
}

export async function listAutomations(): Promise<AutomationSummary[]> {
  const [rows, counts] = await Promise.all([
    db.orm.public.EmailCampaign.where({ kind: 'AUTOMATION' }).all(),
    countsByCampaign(),
  ])
  const last = await run<{ campaign_id: string; at: string }>(
    db.raw.sql`SELECT campaign_id, MAX(sent_at)::text AS at FROM email_messages GROUP BY campaign_id`
      .returnsRow({ campaign_id: 'pg/text@1', at: 'pg/text@1' } as never)
      .build()
  )
  const lastBy = new Map(last.map((r) => [String(r.campaign_id), r.at]))
  return AUTOMATIONS.map((def) => {
    const row = rows.find((r) => r.automationKey === def.key)
    const n = (row && counts.get(row.id)) || emptyCounts()
    return {
      ...def,
      active: row?.status === 'ACTIVE',
      counts: n,
      rates: campaignRates(n),
      lastSentAt: row && lastBy.get(row.id) ? dbTimestampToIso(lastBy.get(row.id)!.replace(' ', 'T')) : null,
    }
  })
}

export async function setAutomationActive(key: AutomationKey, active: boolean, by: string): Promise<void> {
  if (active && !commercialEmailEnabled()) throw new CampaignError(COMMERCIAL_EMAIL_OFF_MESSAGE)
  const { id } = await ensureAutomation(key)
  await exec(
    db.raw.sql`UPDATE email_campaigns SET status = ${active ? 'ACTIVE' : 'PAUSED'}, updated_at = now() WHERE id = ${id}`.affectedCount().build()
  )
  await logAuditEvent({ action: 'EMAIL_AUTOMATION_TOGGLED', entity: 'EmailCampaign', entityId: id, metadata: { key, active, by } })
}

// ── Finding the people ───────────────────────────────────────────────

export interface Candidate {
  orderId: string
  orderNumber: string
  email: string
}

/**
 * Both rules go only to addresses with an ACTIVE e-mail permission (email_consents: given by a member in the
 * modal after signing in, or in the optional box on the payment page). The newsletter is a different list and
 * plays no part here.
 *
 * Unpaid card orders from 3 to 24 hours ago, of addresses with that permission: the latest
 * such order per address, skipping bank-transfer orders (the customer is paying by wire), orders
 * with a payment under way or paid, addresses that bought something since, orders already mailed,
 * a second reminder within 7 days, and any address that got an automatic mail in the last 3 days.
 */
async function abandonedCandidates(campaignId: string, now: Date, limit: number): Promise<Candidate[]> {
  const n = wall(now)
  const rows = await run(
    db.raw.sql`SELECT DISTINCT ON (e.email) o.id AS order_id, o.order_number, e.email
      FROM orders o
      JOIN users u ON u.id = o.user_id
      CROSS JOIN LATERAL (SELECT lower(COALESCE(NULLIF(o.email, ''), u.email)) AS email) e
      JOIN email_consents ec ON ec.email = e.email AND ec.status = 'ACTIVE'
      WHERE o.channel = 'DIRECT' AND o.paid_at IS NULL AND o.status IN ('PAYMENT_PENDING', 'PAYMENT_FAILED')
        AND o.created_at <= ${n}::timestamp - make_interval(hours => ${ABANDONED_AFTER_HOURS})
        AND o.created_at >= ${n}::timestamp - make_interval(hours => ${ABANDONED_UNTIL_HOURS})
        AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id AND (p.provider = 'MANUAL' OR p.status IN ('SUCCEEDED', 'PROCESSING')))
        AND NOT EXISTS (
          SELECT 1 FROM orders o2
          WHERE o2.channel = 'DIRECT' AND o2.created_at > o.created_at
            AND o2.status IN ('PAYMENT_RECEIVED', 'CONFIRMED', 'PREPARING', 'IN_PRODUCTION', 'PACKING', 'SHIPPED', 'DELIVERED')
            AND (o2.user_id = o.user_id OR lower(COALESCE(o2.email, '')) = e.email))
        AND NOT EXISTS (SELECT 1 FROM email_messages m WHERE m.campaign_id = ${campaignId} AND m.order_id = o.id)
        AND NOT EXISTS (
          SELECT 1 FROM email_messages m WHERE m.campaign_id = ${campaignId} AND lower(m.email) = e.email
            AND m.status IN ('QUEUED', 'SENT') AND m.created_at >= ${n}::timestamp - make_interval(days => ${ABANDONED_REPEAT_DAYS}))
        AND NOT EXISTS (
          SELECT 1 FROM email_messages m JOIN email_campaigns c ON c.id = m.campaign_id
          WHERE c.kind = 'AUTOMATION' AND lower(m.email) = e.email AND m.status IN ('QUEUED', 'SENT')
            AND m.created_at >= ${n}::timestamp - make_interval(days => ${MIN_DAYS_BETWEEN_MAILS}))
      ORDER BY e.email, o.created_at DESC
      LIMIT ${limit}`
      .returnsRow({ order_id: 'pg/text@1', order_number: 'pg/text@1', email: 'pg/text@1' } as never)
      .build()
  )
  return rows.map((r) => ({ orderId: String(r.order_id), orderNumber: String(r.order_number), email: String(r.email) }))
}

/**
 * Orders delivered 7 to 30 days ago, of addresses with an active e-mail permission: the most recent per
 * address, skipping orders already mailed and any address that got an automatic mail in the last 3 days.
 */
async function reviewCandidates(campaignId: string, now: Date, limit: number): Promise<Candidate[]> {
  const n = wall(now)
  const rows = await run(
    db.raw.sql`SELECT DISTINCT ON (e.email) o.id AS order_id, o.order_number, e.email
      FROM orders o
      JOIN users u ON u.id = o.user_id
      CROSS JOIN LATERAL (SELECT lower(COALESCE(NULLIF(o.email, ''), u.email)) AS email) e
      JOIN LATERAL (SELECT MIN(h.created_at) AS at FROM order_status_history h WHERE h.order_id = o.id AND h.status = 'DELIVERED') d ON d.at IS NOT NULL
      JOIN email_consents ec ON ec.email = e.email AND ec.status = 'ACTIVE'
      WHERE o.channel = 'DIRECT' AND o.status = 'DELIVERED'
        AND d.at <= ${n}::timestamp - make_interval(days => ${REVIEW_AFTER_DAYS})
        AND d.at >= ${n}::timestamp - make_interval(days => ${REVIEW_UNTIL_DAYS})
        AND NOT EXISTS (SELECT 1 FROM email_messages m WHERE m.campaign_id = ${campaignId} AND m.order_id = o.id)
        AND NOT EXISTS (
          SELECT 1 FROM email_messages m JOIN email_campaigns c ON c.id = m.campaign_id
          WHERE c.kind = 'AUTOMATION' AND lower(m.email) = e.email AND m.status IN ('QUEUED', 'SENT')
            AND m.created_at >= ${n}::timestamp - make_interval(days => ${MIN_DAYS_BETWEEN_MAILS}))
      ORDER BY e.email, d.at DESC
      LIMIT ${limit}`
      .returnsRow({ order_id: 'pg/text@1', order_number: 'pg/text@1', email: 'pg/text@1' } as never)
      .build()
  )
  return rows.map((r) => ({ orderId: String(r.order_id), orderNumber: String(r.order_number), email: String(r.email) }))
}

/**
 * Win-back: customers whose last storefront order is 90 days to a year old and who have not ordered since,
 * with an active e-mail permission. One mail per customer per 90 days, never within 3 days of another automatic mail.
 */
async function winBackCandidates(campaignId: string, now: Date, limit: number): Promise<Candidate[]> {
  const n = wall(now)
  const rows = await run(
    db.raw.sql`SELECT DISTINCT ON (e.email) o.id AS order_id, o.order_number, e.email
      FROM orders o
      JOIN users u ON u.id = o.user_id
      CROSS JOIN LATERAL (SELECT lower(COALESCE(NULLIF(o.email, ''), u.email)) AS email) e
      JOIN email_consents ec ON ec.email = e.email AND ec.status = 'ACTIVE'
      WHERE o.channel = 'DIRECT' AND o.status IN ('PAYMENT_RECEIVED', 'CONFIRMED', 'PREPARING', 'IN_PRODUCTION', 'PACKING', 'SHIPPED', 'DELIVERED')
        AND o.created_at <= ${n}::timestamp - make_interval(days => ${WIN_BACK_AFTER_DAYS})
        AND o.created_at >= ${n}::timestamp - make_interval(days => ${WIN_BACK_UNTIL_DAYS})
        AND NOT EXISTS (
          SELECT 1 FROM orders o2
          WHERE o2.channel = 'DIRECT' AND o2.created_at > o.created_at
            AND o2.status IN ('PAYMENT_RECEIVED', 'CONFIRMED', 'PREPARING', 'IN_PRODUCTION', 'PACKING', 'SHIPPED', 'DELIVERED')
            AND (o2.user_id = o.user_id OR lower(COALESCE(o2.email, '')) = e.email))
        AND NOT EXISTS (SELECT 1 FROM email_messages m WHERE m.campaign_id = ${campaignId} AND m.order_id = o.id)
        AND NOT EXISTS (
          SELECT 1 FROM email_messages m WHERE m.campaign_id = ${campaignId} AND lower(m.email) = e.email
            AND m.status IN ('QUEUED', 'SENT') AND m.created_at >= ${n}::timestamp - make_interval(days => ${WIN_BACK_REPEAT_DAYS}))
        AND NOT EXISTS (
          SELECT 1 FROM email_messages m JOIN email_campaigns c ON c.id = m.campaign_id
          WHERE c.kind = 'AUTOMATION' AND lower(m.email) = e.email AND m.status IN ('QUEUED', 'SENT')
            AND m.created_at >= ${n}::timestamp - make_interval(days => ${MIN_DAYS_BETWEEN_MAILS}))
      ORDER BY e.email, o.created_at DESC
      LIMIT ${limit}`
      .returnsRow({ order_id: 'pg/text@1', order_number: 'pg/text@1', email: 'pg/text@1' } as never)
      .build()
  )
  return rows.map((r) => ({ orderId: String(r.order_id), orderNumber: String(r.order_number), email: String(r.email) }))
}

/**
 * Cross-sell: orders delivered 30 to 90 days ago, with an active e-mail permission, for which the shop has something
 * to suggest (an active, in-stock product of the same collection or category that was not in the order).
 */
async function crossSellCandidates(campaignId: string, now: Date, limit: number): Promise<Candidate[]> {
  const n = wall(now)
  const rows = await run(
    db.raw.sql`SELECT DISTINCT ON (e.email) o.id AS order_id, o.order_number, e.email
      FROM orders o
      JOIN users u ON u.id = o.user_id
      CROSS JOIN LATERAL (SELECT lower(COALESCE(NULLIF(o.email, ''), u.email)) AS email) e
      JOIN LATERAL (SELECT MIN(h.created_at) AS at FROM order_status_history h WHERE h.order_id = o.id AND h.status = 'DELIVERED') d ON d.at IS NOT NULL
      JOIN email_consents ec ON ec.email = e.email AND ec.status = 'ACTIVE'
      WHERE o.channel = 'DIRECT' AND o.status = 'DELIVERED'
        AND d.at <= ${n}::timestamp - make_interval(days => ${CROSS_SELL_AFTER_DAYS})
        AND d.at >= ${n}::timestamp - make_interval(days => ${CROSS_SELL_UNTIL_DAYS})
        AND EXISTS (
          SELECT 1 FROM products p
          WHERE p.is_active AND p.stock > 0
            AND p.id NOT IN (SELECT oi.product_id FROM order_items oi WHERE oi.order_id = o.id)
            AND (p.collection_id IN (SELECT p2.collection_id FROM order_items oi2 JOIN products p2 ON p2.id = oi2.product_id WHERE oi2.order_id = o.id AND p2.collection_id IS NOT NULL)
              OR p.category_id IN (SELECT p3.category_id FROM order_items oi3 JOIN products p3 ON p3.id = oi3.product_id WHERE oi3.order_id = o.id)))
        AND NOT EXISTS (SELECT 1 FROM email_messages m WHERE m.campaign_id = ${campaignId} AND m.order_id = o.id)
        AND NOT EXISTS (
          SELECT 1 FROM email_messages m JOIN email_campaigns c ON c.id = m.campaign_id
          WHERE c.kind = 'AUTOMATION' AND lower(m.email) = e.email AND m.status IN ('QUEUED', 'SENT')
            AND m.created_at >= ${n}::timestamp - make_interval(days => ${MIN_DAYS_BETWEEN_MAILS}))
      ORDER BY e.email, d.at DESC
      LIMIT ${limit}`
      .returnsRow({ order_id: 'pg/text@1', order_number: 'pg/text@1', email: 'pg/text@1' } as never)
      .build()
  )
  return rows.map((r) => ({ orderId: String(r.order_id), orderNumber: String(r.order_number), email: String(r.email) }))
}

/**
 * Products to suggest for an order: active, in stock, not already in it. With `onlyRelated`, only those of the same
 * collection or category (cross-sell); otherwise any. Same collection first, then best sellers and featured ones.
 */
async function recommendationsFor(orderId: string, onlyRelated: boolean): Promise<Recommendation[]> {
  const rows = await run(
    db.raw.sql`SELECT p.name, p.slug, p.price::text AS price FROM products p
      WHERE p.is_active AND p.stock > 0
        AND p.id NOT IN (SELECT oi.product_id FROM order_items oi WHERE oi.order_id = ${orderId})
        AND (NOT ${onlyRelated}::boolean
          OR p.collection_id IN (SELECT p2.collection_id FROM order_items oi2 JOIN products p2 ON p2.id = oi2.product_id WHERE oi2.order_id = ${orderId} AND p2.collection_id IS NOT NULL)
          OR p.category_id IN (SELECT p3.category_id FROM order_items oi3 JOIN products p3 ON p3.id = oi3.product_id WHERE oi3.order_id = ${orderId}))
      ORDER BY (p.collection_id IN (SELECT p4.collection_id FROM order_items oi4 JOIN products p4 ON p4.id = oi4.product_id WHERE oi4.order_id = ${orderId} AND p4.collection_id IS NOT NULL)) DESC NULLS LAST,
        p.is_best_seller DESC, p.is_featured DESC, p.name
      LIMIT ${RECOMMENDATION_COUNT}`
      .returnsRow({ name: 'pg/text@1', slug: 'pg/text@1', price: 'pg/text@1' } as never)
      .build()
  )
  return rows.map((r) => ({ name: String(r.name), path: `/urun/${r.slug}`, price: Number(r.price) }))
}

export async function findCandidates(key: AutomationKey, now: Date = new Date(), limit = 25): Promise<Candidate[]> {
  const { id } = await ensureAutomation(key)
  switch (key) {
    case 'abandoned_payment':
      return abandonedCandidates(id, now, limit)
    case 'review_request':
      return reviewCandidates(id, now, limit)
    case 'win_back':
      return winBackCandidates(id, now, limit)
    case 'cross_sell':
      return crossSellCandidates(id, now, limit)
  }
}

/** How many people the rule would mail right now (for the admin; sends nothing) */
export async function countEligible(key: AutomationKey, now: Date = new Date()): Promise<number> {
  return (await findCandidates(key, now, 200)).length
}

async function orderProducts(orderId: string): Promise<ReviewProduct[]> {
  const rows = await run(
    db.raw.sql`SELECT oi.product_name, oi.quantity, p.slug FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ${orderId} ORDER BY oi.total DESC`
      .returnsRow({ product_name: 'pg/text@1', quantity: 'pg/int4@1', slug: 'pg/text@1' } as never)
      .build()
  )
  return rows.map((r) => ({ name: String(r.product_name), quantity: int(r.quantity), path: r.slug ? `/urun/${r.slug}` : '/urunler' }))
}

// ── Building and sending ─────────────────────────────────────────────

export const optoutUrl = (email: string): string => {
  const { e, s } = signOptout(getSigningSecret(), email)
  return `${SITE_URL}/eposta/ayril?e=${encodeURIComponent(e)}&s=${encodeURIComponent(s)}`
}

function optoutEnvelope(email: string) {
  const { e, s } = signOptout(getSigningSecret(), email)
  const oneClick = `${SITE_URL}/api/email/optout?e=${encodeURIComponent(e)}&s=${encodeURIComponent(s)}`
  return {
    footerHtml: `
  <div>Bu e-postayı, zuulab'dan e-posta almayı onayladığın için aldın.</div>
  <div style="margin-top: 6px;"><a href="${optoutUrl(email)}">İznimi geri alıyorum, bu e-postaları istemiyorum</a></div>`,
    headers: { 'List-Unsubscribe': `<${oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    from: process.env.NEWSLETTER_FROM_EMAIL || undefined,
    replyTo: process.env.SUPPORT_INBOX_EMAIL || undefined,
  }
}

/** The mail for one person, with the signed link that takes the permission back */
export function buildAutomationEmail(mail: AutomationMail, to: string, campaignId: string): EmailSendOptions {
  const env = optoutEnvelope(to)
  const { html } = renderEmailBase({
    title: escapeHtml(mail.subject),
    preheader: escapeHtml(mail.preheader),
    contentHtml: renderCampaignBody(mail.content),
    footerHtml: env.footerHtml,
  })
  return { to, subject: mail.subject, html, from: env.from, replyTo: env.replyTo, headers: env.headers, tags: [{ name: 'campaign', value: campaignId }] }
}

async function mailFor(def: AutomationDef, c: Candidate): Promise<AutomationMail> {
  switch (def.key) {
    case 'win_back': {
      const recs = await recommendationsFor(c.orderId, false)
      if (recs.length === 0) throw new Error('Önerilecek ürün yok')
      return winBackMail(recs, SITE_URL)
    }
    case 'cross_sell': {
      const [bought, recs] = await Promise.all([orderProducts(c.orderId), recommendationsFor(c.orderId, true)])
      if (recs.length === 0) throw new Error('Önerilecek ürün yok')
      return crossSellMail(bought, recs, SITE_URL)
    }
    case 'abandoned_payment':
      return abandonedPaymentMail((await orderProducts(c.orderId)) as MailItem[], SITE_URL)
    case 'review_request':
      return reviewRequestMail(await orderProducts(c.orderId), SITE_URL)
  }
}

/** A sample of the mail to the admin's own address; nothing is recorded */
export async function sendAutomationTest(key: AutomationKey, to: string): Promise<void> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to) || to.length > 254) throw new CampaignError('Geçerli bir e-posta adresi yazın.')
  const def = automationDef(key)
  if (!def) throw new CampaignError('Bilinmeyen otomasyon.')
  const { id } = await ensureAutomation(key)
  const sample = [
    { name: 'örnek ürün adı', quantity: 1, path: '/urunler' },
    { name: 'ikinci örnek ürün', quantity: 2, path: '/urunler' },
  ]
  const recs: Recommendation[] = [
    { name: 'örnek öneri 1', path: '/urunler', price: 249.9 },
    { name: 'örnek öneri 2', path: '/urunler', price: 189 },
  ]
  const mail = {
    abandoned_payment: () => abandonedPaymentMail(sample, SITE_URL),
    review_request: () => reviewRequestMail(sample, SITE_URL),
    win_back: () => winBackMail(recs, SITE_URL),
    cross_sell: () => crossSellMail(sample, recs, SITE_URL),
  }[key]()
  const email = buildAutomationEmail(mail, to, id)
  const result = await getEmailProvider()
    .sendEmail({ ...email, subject: `[TEST] ${mail.subject}`, tags: undefined })
    .catch((e: unknown) => ({ success: false, error: (e as Error)?.message ?? String(e) }))
  if (!result.success) throw new CampaignError(`Test e-postası gönderilemedi: ${result.error ?? 'bilinmeyen hata'}`)
}

export interface AutomationRun {
  key: AutomationKey
  state: 'sent' | 'paused' | 'quiet_hours'
  eligible: number
  sent: number
  failed: number
}

export interface RunOptions {
  /** Defaults to now; tests pass their own clock */
  now?: Date
  /** Find and count, send nothing */
  dryRun?: boolean
  /** Most mails one run sends per automation */
  limit?: number
}

/** Runs every active automation once. Called by the scheduled job (/api/cron/email-automations). */
export async function runAutomations({ now = new Date(), dryRun = false, limit = 25 }: RunOptions = {}): Promise<AutomationRun[]> {
  const results: AutomationRun[] = []
  for (const def of AUTOMATIONS) {
    const { id, active } = await ensureAutomation(def.key)
    // The master switch wins over a row that says ACTIVE: nothing commercial goes out while it is off
    if ((!active || !commercialEmailEnabled()) && !dryRun) {
      results.push({ key: def.key, state: 'paused', eligible: 0, sent: 0, failed: 0 })
      continue
    }
    if (inQuietHours(now) && !dryRun) {
      results.push({ key: def.key, state: 'quiet_hours', eligible: 0, sent: 0, failed: 0 })
      continue
    }
    const candidates = await findCandidates(def.key, now, limit)
    let sent = 0
    let failed = 0
    if (!dryRun) {
      for (const c of candidates) {
        const messageId = randomUUID()
        // Claim first: the database refuses a second mail for the same order, even from an overlapping run
        const claim = await exec(
          db.raw.sql`INSERT INTO email_messages (id, campaign_id, subscriber_id, order_id, email, status, created_at)
                     VALUES (${messageId}, ${id}, NULL, ${c.orderId}, ${c.email}, 'QUEUED', ${wall(now)}::timestamp)
                     ON CONFLICT (campaign_id, order_id) DO NOTHING`.affectedCount().build()
        )
        if (claim.affectedRows !== 1) continue
        try {
          const mail = await mailFor(def, c)
          const result = await getEmailProvider().sendEmail(buildAutomationEmail(mail, c.email, id))
          if (!result.success) throw new Error(result.error ?? 'bilinmeyen hata')
          sent++
          await exec(
            db.raw.sql`UPDATE email_messages SET status = 'SENT', resend_id = NULLIF(${result.providerMessageId ?? ''}, ''), sent_at = ${wall(now)}::timestamp WHERE id = ${messageId}`.affectedCount().build()
          )
        } catch (e) {
          // Not retried by itself: the mail may have been accepted before the error, and a repeat would mail twice
          failed++
          await exec(
            db.raw.sql`UPDATE email_messages SET status = 'FAILED', error = ${String((e as Error)?.message ?? e).slice(0, 300)} WHERE id = ${messageId}`.affectedCount().build()
          )
        }
      }
    }
    results.push({ key: def.key, state: 'sent', eligible: candidates.length, sent, failed })
  }
  return results
}
