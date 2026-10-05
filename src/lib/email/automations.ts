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

export type AutomationKey = 'abandoned_payment' | 'review_request' | 'win_back' | 'cross_sell'

export interface AutomationDef {
  key: AutomationKey
  name: string
  /** One plain sentence for the admin: when it fires */
  rule: string
  /** Who receives it, and why that is allowed */
  audience: string
}

export const AUTOMATIONS: AutomationDef[] = [
  {
    key: 'abandoned_payment',
    name: 'Terk edilen ödeme',
    rule: 'Ödeme sayfasına gelip siparişi tamamlamayan müşteriye, siparişten 3 saat sonra (en geç 24 saat içinde) bir hatırlatma gider.',
    audience:
      'Yalnızca e-posta izni vermiş müşteriler (bülten formu, üyelikte giriş sonrası çıkan pencere, ödeme sayfasındaki kutu ya da hesap tercihleri). Yalnızca bültene yazılmak ya da eski bir aboneliğe sahip olmak bu izin yerine geçmez.',
  },
  {
    key: 'review_request',
    name: 'Değerlendirme isteği',
    rule: 'Siparişin teslim edilmesinden 7 gün sonra (en geç 30 gün içinde) ürünü değerlendirmesi için bir istek gider.',
    audience:
      'Yalnızca e-posta izni vermiş ve siparişini teslim almış müşteriler. İçinde indirim veya reklam yoktur; her e-postada izni geri alma bağlantısı vardır.',
  },
  {
    key: 'win_back',
    name: 'Tekrar satın alma (uzun süredir alışveriş yok)',
    rule: 'Son siparişinin üzerinden 90 gün geçmiş ve o günden beri yeni sipariş vermemiş müşteriye (en geç 1 yıl içinde), öne çıkan ürünlerle bir hatırlatma gider. En fazla 90 günde bir.',
    audience: 'Yalnızca e-posta izni vermiş, daha önce sipariş vermiş müşteriler. İndirim vaadi yoktur; her e-postada izni geri alma bağlantısı vardır.',
  },
  {
    key: 'cross_sell',
    name: 'Çapraz satış (aldığı ürüne uygun öneri)',
    rule: 'Siparişin teslim edilmesinden 30 gün sonra (en geç 90 gün içinde), aldığı ürünlerin koleksiyonundan veya kategorisinden stokta olan, henüz almadığı ürünler önerilir.',
    audience: 'Yalnızca e-posta izni vermiş ve siparişini teslim almış müşteriler. Önerilecek stokta ürün yoksa e-posta gitmez.',
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
export const WIN_BACK_AFTER_DAYS = 90
export const WIN_BACK_UNTIL_DAYS = 365
/** A customer gets the win-back mail at most this often */
export const WIN_BACK_REPEAT_DAYS = 90
export const CROSS_SELL_AFTER_DAYS = 30
export const CROSS_SELL_UNTIL_DAYS = 90
export const RECOMMENDATION_COUNT = 3

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

export interface Recommendation {
  name: string
  /** Product page address without the site: /urun/<slug> */
  path: string
  /** Lira, as the shop shows it */
  price: number
}

const lira = (n: number) => `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`
const recLines = (recs: Recommendation[]) => recs.map((r) => `• ${r.name} — ${lira(r.price)}`).join('\n')

/** Links in these mails carry tags so the shop's own analytics can tell which automation brought a visit */
export const withMailTags = (url: string, automation: AutomationKey): string =>
  `${url}${url.includes('?') ? '&' : '?'}utm_source=email&utm_medium=automation&utm_campaign=${automation}`

export function winBackMail(recs: Recommendation[], siteUrl: string): AutomationMail {
  return {
    subject: 'seni özledik',
    preheader: 'Mağazamızda yeni ve öne çıkan ürünlere göz atabilirsin.',
    content: {
      heading: 'uzun zaman oldu',
      paragraphs: [
        'Son alışverişinin üzerinden epey zaman geçti. O günden bu yana mağazamızda öne çıkan ürünler:',
        recLines(recs),
        'Bir sorun yaşadıysan ya da aklına takılan bir şey varsa bu e-postayı yanıtlayarak bize yazabilirsin.',
      ],
      ctaLabel: 'ürünlere göz at',
      ctaUrl: withMailTags(`${siteUrl}/urunler`, 'win_back'),
    },
  }
}

export function crossSellMail(bought: MailItem[], recs: Recommendation[], siteUrl: string): AutomationMail {
  const first = recs[0]
  return {
    subject: 'aldığın ürünlere yakışacak öneriler',
    preheader: 'Siparişine uygun, stokta olan ürünleri bir araya getirdik.',
    content: {
      heading: 'bunlar da hoşuna gidebilir',
      paragraphs: [
        `Siparişindeki ürünlere (${bought.slice(0, 2).map((b) => b.name).join(', ')}${bought.length > 2 ? ' …' : ''}) uygun olarak seçtiklerimiz:`,
        recLines(recs),
        'Bu önerileri beğenmediysen sorun değil; bu e-postayı yanıtlayarak ne aradığını bize yazabilirsin.',
      ],
      ...(first ? { ctaLabel: 'ürünü incele', ctaUrl: withMailTags(`${siteUrl}${first.path}`, 'cross_sell') } : {}),
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
