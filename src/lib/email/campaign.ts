import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

/**
 * E-mail campaign rules that need no database or network: what a campaign may contain and how
 * it becomes HTML, how a Resend webhook is verified, and how counts become rates.
 * Used by services/email-campaign.service.ts and the admin page.
 */

// ── Content ──────────────────────────────────────────────────────────

export const campaignContentSchema = z.object({
  heading: z.string().trim().min(1, 'Başlık yazın.').max(120, 'Başlık en fazla 120 karakter olabilir.'),
  paragraphs: z
    .array(z.string().trim().max(2000, 'Bir paragraf en fazla 2000 karakter olabilir.'))
    .transform((p) => p.filter(Boolean))
    .pipe(z.array(z.string()).min(1, 'En az bir paragraf yazın.').max(12, 'En fazla 12 paragraf olabilir.')),
  ctaLabel: z.string().trim().max(40, 'Buton yazısı en fazla 40 karakter olabilir.').optional(),
  ctaUrl: z.string().trim().max(500).optional(),
})

export const campaignInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Kampanyaya bir ad verin.').max(120),
    subject: z.string().trim().min(1, 'Konu yazın.').max(150, 'Konu en fazla 150 karakter olabilir.'),
    preheader: z.string().trim().max(150).optional(),
    content: campaignContentSchema,
  })
  .superRefine((v, ctx) => {
    const { ctaLabel, ctaUrl } = v.content
    if (Boolean(ctaLabel) !== Boolean(ctaUrl)) {
      ctx.addIssue({ code: 'custom', path: ['content', 'ctaUrl'], message: 'Buton için hem yazı hem bağlantı gerekir (ya da ikisini de boş bırakın).' })
    } else if (ctaUrl && !/^https:\/\/[^\s]+$/i.test(ctaUrl)) {
      ctx.addIssue({ code: 'custom', path: ['content', 'ctaUrl'], message: 'Bağlantı https:// ile başlamalı.' })
    }
  })

export type CampaignInput = z.infer<typeof campaignInputSchema>
export type CampaignContent = CampaignInput['content']

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/**
 * The inside of the mail. Everything the admin typed is escaped, so a campaign can never carry
 * markup or script, and the shop's template (header, colours, footer with the unsubscribe link)
 * stays as it is.
 */
export function renderCampaignBody(content: CampaignContent): string {
  const paragraphs = content.paragraphs
    .map((p) => `<p>${escapeHtml(p).replace(/\r?\n/g, '<br>')}</p>`)
    .join('\n      ')
  const button =
    content.ctaLabel && content.ctaUrl
      ? `\n      <p><a class="btn" href="${escapeHtml(content.ctaUrl)}">${escapeHtml(content.ctaLabel)}</a></p>`
      : ''
  return `<h2 style="margin: 0 0 16px 0; font-size: 20px; line-height: 1.3; color: #ffffff;">${escapeHtml(content.heading)}</h2>
      ${paragraphs}${button}`
}

// ── Resend webhook (Svix signatures) ─────────────────────────────────

const WEBHOOK_TOLERANCE_SECONDS = 5 * 60

export interface SvixHeaders {
  id: string | null
  timestamp: string | null
  signature: string | null
}

/**
 * Resend signs webhooks with Svix: HMAC-SHA256 of "<id>.<timestamp>.<body>" with the base64 key
 * behind "whsec_". The header may carry several "v1,<signature>" values. A timestamp more than
 * five minutes off is refused, so a captured request cannot be replayed later.
 */
export function verifySvixSignature(secret: string, headers: SvixHeaders, rawBody: string, nowMs: number = Date.now()): boolean {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false
  const ts = Number(headers.timestamp)
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > WEBHOOK_TOLERANCE_SECONDS) return false
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  if (key.length === 0) return false
  const expected = createHmac('sha256', key).update(`${headers.id}.${headers.timestamp}.${rawBody}`).digest()
  return headers.signature.split(' ').some((part) => {
    const [version, value] = part.split(',')
    if (version !== 'v1' || !value) return false
    const given = Buffer.from(value, 'base64')
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
}

export type MessageEvent = 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'delayed' | 'failed' | 'sent'

const EVENT_TYPES: Record<string, MessageEvent> = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'delayed',
  'email.opened': 'opened',
  'email.clicked': 'clicked',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.failed': 'failed',
}

/** Resend's event name ("email.opened") as ours; null for events we do not use */
export function messageEventOf(type: unknown): MessageEvent | null {
  return typeof type === 'string' ? (EVENT_TYPES[type] ?? null) : null
}

// ── Rates ────────────────────────────────────────────────────────────

export interface MessageCounts {
  sent: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  complained: number
  unsubscribed: number
  failed: number
}

const share = (a: number, b: number): number | null => (b > 0 ? a / b : null)

export interface CampaignRates {
  deliveryRate: number | null
  openRate: number | null
  clickRate: number | null
  bounceRate: number | null
  unsubscribeRate: number | null
}

/**
 * Opens, clicks and unsubscribes are measured against the mails that reached the inbox. A
 * delivery event can arrive after an open event, so anything opened or clicked counts as
 * reached too. Opens are an estimate: mail apps that preload images (Apple Mail privacy) count
 * as opens, and blocked images are missed; clicks are the sturdier signal.
 */
export function campaignRates(c: MessageCounts): CampaignRates {
  const reached = Math.max(c.delivered, c.opened, c.clicked)
  return {
    deliveryRate: share(reached, c.sent),
    openRate: share(c.opened, reached),
    clickRate: share(c.clicked, reached),
    bounceRate: share(c.bounced, c.sent),
    unsubscribeRate: share(c.unsubscribed, reached),
  }
}

export function sumCounts(list: MessageCounts[]): MessageCounts {
  const zero: MessageCounts = { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0, unsubscribed: 0, failed: 0 }
  return list.reduce((acc, c) => {
    for (const key of Object.keys(zero) as Array<keyof MessageCounts>) acc[key] += c[key]
    return acc
  }, zero)
}
