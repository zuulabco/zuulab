import 'server-only'
import { randomUUID } from 'node:crypto'
import { db } from '@/prisma/db'
import { dbTimestampToIso } from '@/lib/db/time'
import { logAuditEvent } from './admin.service'
import { getEmailProvider } from './notification/email-provider.factory'
import { renderEmailBase } from './notification/templates/email-base.template'
import type { EmailSendOptions } from './notification/notification.interface'
import { newsletterEnvelope } from './newsletter.service'
import { COMMERCIAL_EMAIL_OFF_MESSAGE, commercialEmailEnabled } from '@/lib/email/policy'
import {
  campaignInputSchema,
  campaignRates,
  escapeHtml,
  messageEventOf,
  renderCampaignBody,
  sumCounts,
  type CampaignContent,
  type CampaignInput,
  type CampaignRates,
  type MessageCounts,
  type MessageEvent,
} from '@/lib/email/campaign'

/**
 * Newsletter campaigns written in the admin and sent through Resend, with what happened to each
 * mail (delivered, opened, clicked, bounced, unsubscribed) filled in by Resend's webhook.
 *
 * Audience: subscribers who confirmed their address (ACTIVE) and have not left. Every mail
 * carries its own unsubscribe link. A campaign is sent once: DRAFT -> SENDING is one conditional
 * update, so a second click or a second request cannot start it again.
 */

type Rec = Record<string, unknown>
const run = <T = Rec>(query: unknown) => db.runtime().query(query as never) as unknown as Promise<T[]>
const exec = (query: unknown) => db.runtime().execute(query as never) as unknown as Promise<{ affectedRows: number }>
const int = (v: unknown) => Number(v ?? 0)

export class CampaignError extends Error {
  readonly isValidation = true
}

export interface CampaignSummary {
  id: string
  name: string
  subject: string
  preheader: string | null
  content: CampaignContent
  status: 'DRAFT' | 'SENDING' | 'SENT'
  recipientCount: number
  sentAt: string | null
  createdAt: string | null
  counts: MessageCounts
  rates: CampaignRates
}

export const emptyCounts = (): MessageCounts => ({ sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0, unsubscribed: 0, failed: 0 })

export async function countsByCampaign(): Promise<Map<string, MessageCounts>> {
  const rows = await run(
    db.raw.sql`SELECT campaign_id,
        COUNT(*) FILTER (WHERE status = 'SENT')::int AS sent,
        COUNT(delivered_at)::int AS delivered,
        COUNT(first_opened_at)::int AS opened,
        COUNT(first_clicked_at)::int AS clicked,
        COUNT(bounced_at)::int AS bounced,
        COUNT(complained_at)::int AS complained,
        COUNT(unsubscribed_at)::int AS unsubscribed,
        COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed
      FROM email_messages GROUP BY campaign_id`
      .returnsRow({
        campaign_id: 'pg/text@1', sent: 'pg/int4@1', delivered: 'pg/int4@1', opened: 'pg/int4@1', clicked: 'pg/int4@1',
        bounced: 'pg/int4@1', complained: 'pg/int4@1', unsubscribed: 'pg/int4@1', failed: 'pg/int4@1',
      } as never)
      .build()
  )
  return new Map(
    rows.map((r) => [
      String(r.campaign_id),
      {
        sent: int(r.sent), delivered: int(r.delivered), opened: int(r.opened), clicked: int(r.clicked),
        bounced: int(r.bounced), complained: int(r.complained), unsubscribed: int(r.unsubscribed), failed: int(r.failed),
      },
    ])
  )
}

export async function listCampaigns(): Promise<CampaignSummary[]> {
  const [rows, counts] = await Promise.all([
    db.orm.public.EmailCampaign.where({ kind: 'CAMPAIGN' }).orderBy((c) => c.createdAt.desc()).all(),
    countsByCampaign(),
  ])
  return rows.map((c) => {
    const n = counts.get(c.id) ?? emptyCounts()
    return {
      id: c.id,
      name: c.name,
      subject: c.subject,
      preheader: c.preheader ?? null,
      content: c.content as unknown as CampaignContent,
      status: c.status as CampaignSummary['status'],
      recipientCount: c.recipientCount,
      sentAt: dbTimestampToIso(c.sentAt),
      createdAt: dbTimestampToIso(c.createdAt),
      counts: n,
      rates: campaignRates(n),
    }
  })
}

export interface EmailOverview {
  campaigns: CampaignSummary[]
  /** All sent campaigns together */
  totals: MessageCounts
  totalRates: CampaignRates
  subscribers: { active: number; pending: number; unsubscribed: number }
}

export async function getEmailOverview(): Promise<EmailOverview> {
  const [campaigns, subs] = await Promise.all([
    listCampaigns(),
    run(
      db.raw.sql`SELECT status, COUNT(*)::int AS n FROM newsletter_subscribers GROUP BY status`
        .returnsRow({ status: 'pg/text@1', n: 'pg/int4@1' } as never)
        .build()
    ),
  ])
  const by = new Map(subs.map((r) => [String(r.status), int(r.n)]))
  const totals = sumCounts(campaigns.map((c) => c.counts))
  return {
    campaigns,
    totals,
    totalRates: campaignRates(totals),
    subscribers: { active: by.get('ACTIVE') ?? 0, pending: by.get('PENDING') ?? 0, unsubscribed: by.get('UNSUBSCRIBED') ?? 0 },
  }
}

// ── Writing ──────────────────────────────────────────────────────────

function parseInput(input: unknown): CampaignInput {
  const parsed = campaignInputSchema.safeParse(input)
  if (!parsed.success) throw new CampaignError(parsed.error.issues[0]?.message ?? 'Kampanya bilgileri geçersiz.')
  return parsed.data
}

async function getCampaign(id: string) {
  const row = await db.orm.public.EmailCampaign.where({ id }).first()
  if (!row) throw new CampaignError('Kampanya bulunamadı.')
  return row
}

/** Creates a draft, or updates one (a campaign that is already sending or sent is never changed) */
export async function saveCampaign(input: unknown, id: string | undefined, by: string): Promise<string> {
  const data = parseInput(input)
  const fields = {
    name: data.name,
    subject: data.subject,
    preheader: data.preheader || null,
    content: data.content as never,
  }
  if (!id) {
    const created = await db.orm.public.EmailCampaign.create({ ...fields, status: 'DRAFT', createdBy: by } as never)
    return created.id
  }
  const { affectedRows } = await exec(
    db.raw.sql`UPDATE email_campaigns
               SET name = ${fields.name}, subject = ${fields.subject}, preheader = NULLIF(${fields.preheader ?? ''}, ''),
                   content = ${JSON.stringify(data.content)}::jsonb, updated_at = now()
               WHERE id = ${id} AND status = 'DRAFT'`.affectedCount().build()
  )
  if (affectedRows !== 1) throw new CampaignError('Gönderilmiş ya da gönderilmekte olan kampanya değiştirilemez.')
  return id
}

export async function deleteCampaign(id: string): Promise<void> {
  const { affectedRows } = await exec(
    db.raw.sql`DELETE FROM email_campaigns WHERE id = ${id} AND status = 'DRAFT'`.affectedCount().build()
  )
  if (affectedRows !== 1) throw new CampaignError('Yalnızca taslak kampanyalar silinebilir.')
}

// ── Rendering and sending ────────────────────────────────────────────

/** The full mail for one recipient. `token` is the subscriber's own unsubscribe token. */
export function buildCampaignEmail(
  campaign: { id: string; subject: string; preheader: string | null; content: CampaignContent },
  to: string,
  token: string,
  messageId?: string
): EmailSendOptions {
  const env = newsletterEnvelope(token, messageId)
  const { html } = renderEmailBase({
    title: escapeHtml(campaign.subject),
    preheader: campaign.preheader ? escapeHtml(campaign.preheader) : undefined,
    contentHtml: renderCampaignBody(campaign.content),
    footerHtml: env.footerHtml,
  })
  return {
    to,
    subject: campaign.subject,
    html,
    from: env.from,
    replyTo: env.replyTo,
    headers: env.headers,
    tags: [{ name: 'campaign', value: campaign.id }],
  }
}

/** What the mail looks like, for the admin's preview (the unsubscribe link is a placeholder) */
export function previewCampaignHtml(input: unknown): string {
  const data = parseInput(input)
  return buildCampaignEmail({ id: 'preview', subject: data.subject, preheader: data.preheader || null, content: data.content }, 'ornek@zuulab.com', 'onizleme').html
}

/** One test mail to the admin's own address; never recorded as a campaign mail and never counted */
export async function sendTestEmail(id: string, to: string): Promise<void> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to) || to.length > 254) throw new CampaignError('Geçerli bir e-posta adresi yazın.')
  const c = await getCampaign(id)
  const email = buildCampaignEmail(
    { id: c.id, subject: c.subject, preheader: c.preheader ?? null, content: c.content as unknown as CampaignContent },
    to,
    'test'
  )
  const result = await getEmailProvider()
    .sendEmail({ ...email, subject: `[TEST] ${c.subject}`, tags: undefined })
    .catch((e: unknown) => ({ success: false, error: (e as Error)?.message ?? String(e) }))
  if (!result.success) throw new CampaignError(`Test e-postası gönderilemedi: ${result.error ?? 'bilinmeyen hata'}`)
}

async function activeAudience(): Promise<Array<{ id: string; email: string; token: string }>> {
  const rows = await run(
    db.raw.sql`SELECT id, email, token FROM newsletter_subscribers WHERE status = 'ACTIVE' ORDER BY created_at`
      .returnsRow({ id: 'pg/text@1', email: 'pg/text@1', token: 'pg/text@1' } as never)
      .build()
  )
  return rows.map((r) => ({ id: String(r.id), email: String(r.email), token: String(r.token) }))
}

export async function countAudience(): Promise<number> {
  const [row] = await run(
    db.raw.sql`SELECT COUNT(*)::int AS n FROM newsletter_subscribers WHERE status = 'ACTIVE'`.returnsRow({ n: 'pg/int4@1' } as never).build()
  )
  return int(row?.n)
}

const CHUNK = 50

/** Sends the campaign's queued mails in groups and records each mail's result */
async function deliverQueued(campaign: { id: string; subject: string; preheader: string | null; content: CampaignContent }): Promise<{ sent: number; failed: number; firstError: string | null }> {
  const queued = await run(
    db.raw.sql`SELECT m.id, m.email, s.token
      FROM email_messages m JOIN newsletter_subscribers s ON s.id = m.subscriber_id
      WHERE m.campaign_id = ${campaign.id} AND m.status = 'QUEUED' AND s.status = 'ACTIVE'
      ORDER BY m.created_at`
      .returnsRow({ id: 'pg/text@1', email: 'pg/text@1', token: 'pg/text@1' } as never)
      .build()
  )
  const provider = getEmailProvider()
  let sent = 0
  let failed = 0
  let firstError: string | null = null

  for (let i = 0; i < queued.length; i += CHUNK) {
    const group = queued.slice(i, i + CHUNK)
    const mails = group.map((m) => buildCampaignEmail(campaign, String(m.email), String(m.token), String(m.id)))
    let results: Array<{ success: boolean; providerMessageId?: string; error?: string }>
    try {
      results = provider.sendBatch
        ? await provider.sendBatch(mails, `campaign-${campaign.id}-${String(group[0].id)}`)
        : await Promise.all(mails.map((mail) => provider.sendEmail(mail).catch((e: unknown) => ({ success: false, error: (e as Error)?.message ?? String(e) }))))
    } catch (e) {
      const error = (e as Error)?.message ?? String(e)
      results = group.map(() => ({ success: false, error }))
    }
    for (let j = 0; j < group.length; j++) {
      const r = results[j] ?? { success: false, error: 'Sonuç alınamadı.' }
      if (r.success) {
        sent++
        await exec(
          db.raw.sql`UPDATE email_messages SET status = 'SENT', resend_id = NULLIF(${r.providerMessageId ?? ''}, ''), sent_at = now() WHERE id = ${String(group[j].id)}`.affectedCount().build()
        )
      } else {
        failed++
        firstError ??= r.error ?? 'bilinmeyen hata'
        await exec(
          db.raw.sql`UPDATE email_messages SET status = 'FAILED', error = ${(r.error ?? 'bilinmeyen hata').slice(0, 300)} WHERE id = ${String(group[j].id)}`.affectedCount().build()
        )
      }
    }
  }
  return { sent, failed, firstError }
}

export interface SendResult {
  recipients: number
  sent: number
  failed: number
}

/**
 * Sends a draft to every confirmed subscriber. `confirmRecipients` must be the number the admin
 * saw in the confirmation step: if the audience changed meanwhile nothing is sent. If not a
 * single mail goes out (for example Resend is misconfigured) the campaign goes back to draft.
 */
export async function sendCampaign(id: string, confirmRecipients: number, by: string): Promise<SendResult> {
  if (!commercialEmailEnabled()) throw new CampaignError(COMMERCIAL_EMAIL_OFF_MESSAGE)
  const campaign = await getCampaign(id)
  const audience = await activeAudience()
  if (audience.length === 0) throw new CampaignError('Gönderilecek onaylı abone yok.')
  if (audience.length !== confirmRecipients) {
    throw new CampaignError(`Abone sayısı değişti (${audience.length}). Onay ekranını yenileyip tekrar deneyin.`)
  }

  const { affectedRows } = await exec(
    db.raw.sql`UPDATE email_campaigns SET status = 'SENDING', recipient_count = ${audience.length}, updated_at = now()
               WHERE id = ${id} AND status = 'DRAFT'`.affectedCount().build()
  )
  if (affectedRows !== 1) throw new CampaignError('Bu kampanya zaten gönderildi ya da gönderiliyor.')

  for (const s of audience) {
    await db.orm.public.EmailMessage.create({ id: randomUUID(), campaignId: id, subscriberId: s.id, email: s.email, status: 'QUEUED' } as never)
  }

  const content = campaign.content as unknown as CampaignContent
  const { sent, failed, firstError } = await deliverQueued({ id, subject: campaign.subject, preheader: campaign.preheader ?? null, content })

  if (sent === 0) {
    // Nothing went out: undo, so the campaign can be sent again once the cause is fixed
    await exec(db.raw.sql`DELETE FROM email_messages WHERE campaign_id = ${id}`.affectedCount().build())
    await exec(db.raw.sql`UPDATE email_campaigns SET status = 'DRAFT', recipient_count = 0, updated_at = now() WHERE id = ${id}`.affectedCount().build())
    throw new CampaignError(`E-postalar gönderilemedi: ${firstError ?? 'bilinmeyen hata'}`)
  }

  // Subscribers who left while the mails were going out are not mailed
  await exec(db.raw.sql`UPDATE email_messages SET status = 'SKIPPED' WHERE campaign_id = ${id} AND status = 'QUEUED'`.affectedCount().build())
  await exec(db.raw.sql`UPDATE email_campaigns SET status = 'SENT', sent_at = now(), updated_at = now() WHERE id = ${id}`.affectedCount().build())
  await logAuditEvent({
    action: 'EMAIL_CAMPAIGN_SENT',
    entity: 'EmailCampaign',
    entityId: id,
    metadata: { by, recipients: audience.length, sent, failed },
  })
  return { recipients: audience.length, sent, failed }
}

// ── Resend webhook ───────────────────────────────────────────────────

export type WebhookOutcome = 'applied' | 'duplicate' | 'ignored' | 'retry'

/**
 * Applies one Resend event to the campaign mail it belongs to. `eventId` is Svix's delivery id:
 * a repeat of the same delivery changes nothing. An event for a mail we do not know is ignored
 * (order mails send events too), unless it is tagged as a campaign mail: then our own record of
 * the mail may just not be saved yet, so Resend is asked to retry.
 */
export async function applyResendEvent(eventId: string, payload: { type?: unknown; data?: Rec }): Promise<WebhookOutcome> {
  const event = messageEventOf(payload.type)
  const data = payload.data ?? {}
  const resendId = typeof data.email_id === 'string' ? data.email_id : ''
  if (!event || !resendId) return 'ignored'

  const [message] = await run(
    db.raw.sql`SELECT id, email FROM email_messages WHERE resend_id = ${resendId}`.returnsRow({ id: 'pg/text@1', email: 'pg/text@1' } as never).build()
  )
  if (!message) {
    const tags = data.tags as Rec | Array<{ name?: string }> | undefined
    const campaignTagged = Array.isArray(tags) ? tags.some((t) => t?.name === 'campaign') : Boolean(tags && 'campaign' in tags)
    return campaignTagged ? 'retry' : 'ignored'
  }

  const { affectedRows } = await exec(
    db.raw.sql`INSERT INTO email_webhook_events (id, type) VALUES (${eventId.slice(0, 120)}, ${String(payload.type).slice(0, 60)}) ON CONFLICT (id) DO NOTHING`.affectedCount().build()
  )
  if (affectedRows === 0) return 'duplicate'

  const id = String(message.id)
  const touch = (e: MessageEvent) =>
    exec(db.raw.sql`UPDATE email_messages SET last_event = ${e}, last_event_at = now() WHERE id = ${id}`.affectedCount().build())

  switch (event) {
    case 'delivered':
      await exec(db.raw.sql`UPDATE email_messages SET delivered_at = COALESCE(delivered_at, now()), last_event = 'delivered', last_event_at = now() WHERE id = ${id}`.affectedCount().build())
      break
    case 'opened':
      await exec(db.raw.sql`UPDATE email_messages SET first_opened_at = COALESCE(first_opened_at, now()), open_count = open_count + 1, last_event = 'opened', last_event_at = now() WHERE id = ${id}`.affectedCount().build())
      break
    case 'clicked':
      await exec(db.raw.sql`UPDATE email_messages SET first_clicked_at = COALESCE(first_clicked_at, now()), click_count = click_count + 1, last_event = 'clicked', last_event_at = now() WHERE id = ${id}`.affectedCount().build())
      break
    case 'bounced': {
      await exec(db.raw.sql`UPDATE email_messages SET bounced_at = COALESCE(bounced_at, now()), last_event = 'bounced', last_event_at = now() WHERE id = ${id}`.affectedCount().build())
      const bounce = data.bounce as { type?: unknown } | undefined
      // A permanent bounce means the address does not work: stop mailing it. A temporary one (full inbox) does not.
      if (String(bounce?.type ?? '').toLowerCase() === 'permanent') await suppress(String(message.email))
      break
    }
    case 'complained':
      await exec(db.raw.sql`UPDATE email_messages SET complained_at = COALESCE(complained_at, now()), last_event = 'complained', last_event_at = now() WHERE id = ${id}`.affectedCount().build())
      // A spam complaint is an unsubscribe, whatever the person did or did not click
      await suppress(String(message.email))
      break
    case 'failed':
      await exec(db.raw.sql`UPDATE email_messages SET status = 'FAILED', error = 'Resend: gönderilemedi', last_event = 'failed', last_event_at = now() WHERE id = ${id}`.affectedCount().build())
      break
    default:
      await touch(event)
  }
  return 'applied'
}

async function suppress(email: string): Promise<void> {
  await exec(
    db.raw.sql`UPDATE newsletter_subscribers SET status = 'UNSUBSCRIBED', unsubscribed_at = now(), updated_at = now() WHERE email = ${email} AND status = 'ACTIVE'`.affectedCount().build()
  )
}
