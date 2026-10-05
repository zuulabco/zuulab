import { createHmac, timingSafeEqual } from 'node:crypto'
import type { CampaignContent } from './campaign'

/**
 * Automatic e-mails: the rules that need no database. Which automations exist, when a mail may
 * go out, what it says, and the signed "I do not want these" link. The service
 * (services/email-automation.service.ts) finds the people and sends.
 *
 * Restraint is the point: one mail per order and automation, at most one automatic mail per
 * address every 3 days, a reminder for an unpaid order at most once a week, nothing at night.
 */

export type AutomationKey = 'abandoned_payment' | 'review_request'

export interface AutomationDef {
  key: AutomationKey
  name: string
  /** One plain sentence for the admin: when it fires */
  rule: string
  /** Who receives it, and why that is allowed */
  audience: string
  /** Marketing mails need the person's consent: they go only to confirmed newsletter subscribers */
  marketing: boolean
}

export const AUTOMATIONS: AutomationDef[] = [
  {
    key: 'abandoned_payment',
    name: 'Terk edilen ödeme',
    rule: 'Ödeme sayfasına gelip siparişi tamamlamayan müşteriye, siparişten 3 saat sonra (en geç 24 saat içinde) bir hatırlatma gider.',
    audience: 'Yalnızca bültene onay vermiş (aktif abone) müşteriler: pazarlama e-postası için izin gerekir.',
    marketing: true,
  },
  {
    key: 'review_request',
    name: 'Değerlendirme isteği',
    rule: 'Siparişin teslim edilmesinden 7 gün sonra (en geç 30 gün içinde) ürünü değerlendirmesi için bir istek gider.',
    audience:
      'Siparişi teslim alan müşteriler. İçinde indirim veya reklam yoktur, siparişle ilgili bir istektir; her e-postada “bu e-postaları istemiyorum” bağlantısı vardır.',
    marketing: false,
  },
]

export function automationDef(key: string): AutomationDef | undefined {
  return AUTOMATIONS.find((a) => a.key === key)
}

// ── Timing ───────────────────────────────────────────────────────────

export const ABANDONED_AFTER_HOURS = 3
export const ABANDONED_UNTIL_HOURS = 24
export const REVIEW_AFTER_DAYS = 7
export const REVIEW_UNTIL_DAYS = 30
/** An address gets at most one automatic mail within this many days */
export const MIN_DAYS_BETWEEN_MAILS = 3
/** A reminder for an unpaid order is repeated at most this often */
export const ABANDONED_REPEAT_DAYS = 7

/** Türkiye is UTC+3 all year */
export const turkeyHour = (at: Date): number => (at.getUTCHours() + 3) % 24

/** No automatic mail between 21:00 and 09:00 Turkish time; it waits for the morning */
export function inQuietHours(at: Date): boolean {
  const h = turkeyHour(at)
  return h >= 21 || h < 9
}

// ── Content ──────────────────────────────────────────────────────────

export interface MailItem {
  name: string
  quantity: number
}

export interface AutomationMail {
  subject: string
  preheader: string
  content: CampaignContent
}

const itemLines = (items: MailItem[]) =>
  items
    .slice(0, 6)
    .map((i) => `• ${i.name}${i.quantity > 1 ? ` × ${i.quantity}` : ''}`)
    .join('\n') + (items.length > 6 ? `\n… ve ${items.length - 6} ürün daha` : '')

export function abandonedPaymentMail(items: MailItem[], siteUrl: string): AutomationMail {
  return {
    subject: 'sepetindeki ürünler seni bekliyor',
    preheader: 'Ödemeni tamamlamak için sepetine dönebilirsin.',
    content: {
      heading: 'sepetinde ürünler kaldı',
      paragraphs: [
        'Ödemeni tamamlamadığını fark ettik. Seçtiğin ürünler:',
        itemLines(items),
        'Stok durumu değişebileceği için ödemeni tamamlamak istersen sepetine dönebilirsin. Bir sorun yaşadıysan bu e-postayı yanıtlayarak bize yazabilirsin, yardımcı oluruz.',
      ],
      ctaLabel: 'sepetime dön',
      ctaUrl: `${siteUrl}/sepet`,
    },
  }
}

export interface ReviewProduct extends MailItem {
  /** Product page address without the site: /urun/<slug> */
  path: string
}

export function reviewRequestMail(products: ReviewProduct[], siteUrl: string): AutomationMail {
  const first = products[0]
  return {
    subject: 'siparişin nasıldı?',
    preheader: 'Ürünü değerlendirmen bizim için çok değerli.',
    content: {
      heading: 'siparişin nasıldı?',
      paragraphs: [
        'Siparişin sana ulaştığından beri bir hafta geçti. Memnun kaldıysan ya da söyleyeceğin bir şey varsa, birkaç dakikanı ayırıp ürünü değerlendirmen bizim için de diğer müşterilerimiz için de çok değerli olur.',
        itemLines(products),
        'Bir sorun varsa bu e-postayı yanıtlayarak bize yazabilirsin; yardımcı oluruz.',
      ],
      ...(first ? { ctaLabel: 'ürünü değerlendir', ctaUrl: `${siteUrl}${first.path}#reviews` } : {}),
    },
  }
}

// ── "I do not want these" link ───────────────────────────────────────

const optoutSignature = (secret: string, email: string) =>
  createHmac('sha256', secret).update(`email-optout:${email}`).digest('base64url')

/** `e` (address, base64url) and `s` (signature) for the opt-out link of one address */
export function signOptout(secret: string, email: string): { e: string; s: string } {
  const address = email.trim().toLowerCase()
  return { e: Buffer.from(address, 'utf8').toString('base64url'), s: optoutSignature(secret, address) }
}

/** The address behind a valid link, or null (forged, damaged or unsigned) */
export function verifyOptout(secret: string, e: string, s: string): string | null {
  if (!secret || !e || !s || e.length > 400 || s.length > 100) return null
  let address: string
  try {
    address = Buffer.from(e, 'base64url').toString('utf8').trim().toLowerCase()
  } catch {
    return null
  }
  if (!address.includes('@')) return null
  const expected = Buffer.from(optoutSignature(secret, address))
  const given = Buffer.from(s)
  return given.length === expected.length && timingSafeEqual(given, expected) ? address : null
}
