import 'server-only'
import { randomBytes, randomInt } from 'node:crypto'
import { db } from '@/prisma/db'
import { dbNumeric } from '@/lib/db/numeric'
import { dbTimestampToIso, fromDbTimestamp, toDbTimestamp } from '@/lib/db/time'
import { SITE_URL } from '@/lib/config/urls'
import { getEmailProvider } from './notification/email-provider.factory'
import { renderEmailBase } from './notification/templates/email-base.template'
import { logAuditEvent } from './admin.service'
import { CHECKOUT_MARKETING_CONSENT_TEXT, NEWSLETTER_CONSENT_TEXT } from '@/lib/newsletter/consent'

/**
 * Newsletter with double opt-in.
 *
 *   subscribe → PENDING + confirmation mail
 *   confirm   → ACTIVE + a random single-use %10 code (once per address, ever)
 *   unsubscribe → UNSUBSCRIBED (row and consent history are kept)
 *
 * Welcome codes are ordinary coupons marked source=NEWSLETTER, so checkout handles
 * them like any other code while the admin panel lists them apart from hand-made ones.
 */

export const WELCOME_DISCOUNT_PERCENT = 10

// No 0/O, 1/I/L: codes are read off a screen and typed by hand.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 10
const RESEND_CONFIRM_AFTER_MS = 2 * 60 * 1000

export type SubscribeOutcome = 'confirmation_sent' | 'already_active' | 'confirmation_recently_sent'

export class NewsletterError extends Error {
  readonly isValidation = true
}

export function normalizeEmail(input: unknown): string {
  const email = String(input ?? '').trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new NewsletterError('Geçerli bir e-posta adresi yazın.')
  }
  return email
}

/** Random, unguessable, unambiguous: e.g. "K7QMX4PT2W". */
export function generateWelcomeCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return code
}

const newToken = () => randomBytes(24).toString('base64url')

const confirmUrl = (token: string) => `${SITE_URL}/bulten/onay?t=${encodeURIComponent(token)}`
const unsubscribeUrl = (token: string, messageId?: string) =>
  `${SITE_URL}/bulten/ayril?t=${encodeURIComponent(token)}${messageId ? `&m=${encodeURIComponent(messageId)}` : ''}`

function newsletterFrom(): string | undefined {
  return process.env.NEWSLETTER_FROM_EMAIL || undefined
}

function replyTo(): string | undefined {
  return process.env.SUPPORT_INBOX_EMAIL || undefined
}

const footer = (token: string, messageId?: string) => `
  <div>Bu e-postayı zuulab kampanya e-postalarına onay verdiğiniz için aldınız.</div>
  <div style="margin-top: 6px;"><a href="${unsubscribeUrl(token, messageId)}">Bültenden ayrıl</a></div>`

/**
 * What every newsletter mail needs besides its content: the footer with the unsubscribe link, the
 * one-click List-Unsubscribe headers, sender and reply-to. The message id (a campaign mail) is
 * carried in the links so the unsubscribe can be counted against that campaign.
 */
export function newsletterEnvelope(token: string, messageId?: string) {
  const oneClick = `${SITE_URL}/api/newsletter/unsubscribe?t=${encodeURIComponent(token)}${messageId ? `&m=${encodeURIComponent(messageId)}` : ''}`
  return {
    footerHtml: footer(token, messageId),
    headers: { 'List-Unsubscribe': `<${oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    from: newsletterFrom(),
    replyTo: replyTo(),
  }
}

async function sendNewsletterMail(params: { to: string; subject: string; contentHtml: string; token: string; key: string }): Promise<boolean> {
  const { html } = renderEmailBase({ title: params.subject, contentHtml: params.contentHtml, footerHtml: footer(params.token) })
  // The provider throws when misconfigured (e.g. missing API key in production)
  const result = await getEmailProvider().sendEmail({
    to: params.to,
    subject: params.subject,
    html,
    from: newsletterFrom(),
    replyTo: replyTo(),
    headers: {
      'List-Unsubscribe': `<${SITE_URL}/api/newsletter/unsubscribe?t=${encodeURIComponent(params.token)}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    idempotencyKey: params.key,
  }).catch((err: unknown) => ({ success: false, error: (err as Error)?.message ?? String(err) }))
  if (!result.success) console.error('[newsletter] send failed:', params.subject, result.error)
  return result.success
}

/**
 * Sends the confirmation mail; if it does not go out, clears the "sent at" mark
 * (so an immediate retry is allowed) and tells the visitor instead of claiming success.
 */
async function sendConfirmationOrFail(subscriberId: string, email: string, token: string): Promise<void> {
  if (await sendConfirmation(email, token)) return
  await db.runtime().execute(
    db.raw.sql`UPDATE newsletter_subscribers SET confirm_email_at = NULL, updated_at = now() WHERE id = ${subscriberId}`.affectedCount().build()
  )
  throw new NewsletterError('Onay e-postası şu an gönderilemedi. Birkaç dakika sonra tekrar dene.')
}

async function sendConfirmation(email: string, token: string) {
  return sendNewsletterMail({
    to: email,
    token,
    key: `newsletter-confirm:${token}:${Date.now()}`,
    subject: 'zuulab bülteni: e-postanı onayla',
    contentHtml: `
      <p>Merhaba,</p>
      <p>zuulab bültenine kaydolmak için aşağıdaki butona tıklaman yeterli. Onayladığında sana özel <strong>%${WELCOME_DISCOUNT_PERCENT} indirim kodun</strong> hemen gelecek.</p>
      <p><a class="btn" href="${confirmUrl(token)}">aboneliğimi onayla</a></p>
      <p style="font-size: 12px; color: #9ca3af;">Bu isteği sen yapmadıysan e-postayı yok sayabilirsin; onaylamadığın sürece listeye eklenmezsin.</p>`,
  })
}

async function sendWelcome(email: string, token: string, code: string) {
  return sendNewsletterMail({
    to: email,
    token,
    key: `newsletter-welcome:${token}`,
    subject: `hoş geldin: %${WELCOME_DISCOUNT_PERCENT} indirim kodun`,
    contentHtml: `
      <p>Aboneliğin onaylandı, aramıza hoş geldin.</p>
      <p>Sana özel, <strong>tek kullanımlık</strong> %${WELCOME_DISCOUNT_PERCENT} indirim kodun:</p>
      <p style="margin: 20px 0; font-size: 24px; font-weight: 700; letter-spacing: 0.12em; color: #ffffff;">${code}</p>
      <p>Ödeme sayfasındaki "kupon kodu" alanına yazman yeterli.</p>
      <p><a class="btn" href="${SITE_URL}/urunler">alışverişe başla</a></p>`,
  })
}

/** Creates the welcome coupon; retries on the (astronomically unlikely) code clash. */
async function createWelcomeCoupon(email: string): Promise<{ id: string; code: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateWelcomeCode()
    try {
      const row = await db.orm.public.Coupon.create({
        code,
        description: `Bülten hoş geldin kodu (${email})`,
        type: 'PERCENTAGE',
        discountValue: dbNumeric(WELCOME_DISCOUNT_PERCENT),
        maxUses: 1,
        maxUsesPerUser: 1,
        currentUses: 0,
        isActive: true,
        source: 'NEWSLETTER',
        assignedEmail: email,
      } as never)
      return { id: row.id, code: row.code }
    } catch (err) {
      const text = String((err as { message?: string })?.message ?? err) + JSON.stringify(err ?? {})
      if (!/unique|duplicate key|23505/i.test(text)) throw err
    }
  }
  throw new Error('İndirim kodu oluşturulamadı.')
}

export async function subscribeToNewsletter(input: {
  email: unknown
  consent: unknown
  ip?: string | null
  userAgent?: string | null
  source?: string
}): Promise<SubscribeOutcome> {
  const email = normalizeEmail(input.email)
  if (input.consent !== true) {
    throw new NewsletterError('Bülten için e-posta iletişim onayını işaretlemen gerekiyor.')
  }
  const consent = {
    consentText: NEWSLETTER_CONSENT_TEXT,
    consentIp: input.ip?.slice(0, 64) ?? null,
    consentAgent: input.userAgent?.slice(0, 300) ?? null,
    source: (input.source || 'homepage').slice(0, 40),
  }

  const existing = await db.orm.public.NewsletterSubscriber.where({ email }).first()

  if (existing?.status === 'ACTIVE') return 'already_active'

  if (existing?.status === 'PENDING') {
    const last = fromDbTimestamp(existing.confirmEmailAt)
    if (last && Date.now() - last.getTime() < RESEND_CONFIRM_AFTER_MS) return 'confirmation_recently_sent'
    await db.orm.public.NewsletterSubscriber.where({ id: existing.id }).update({ ...consent, confirmEmailAt: toDbTimestamp() } as never)
    await sendConfirmationOrFail(existing.id, email, existing.token)
    return 'confirmation_sent'
  }

  if (existing) {
    // Came back after unsubscribing: fresh consent, same row and same token (so the
    // "bültenden ayrıl" links in their earlier mails keep working). An earlier welcome
    // code stays theirs; confirming again never mints a second one.
    await db.runtime().execute(
      db.raw.sql`UPDATE newsletter_subscribers
                 SET status = 'PENDING', unsubscribed_at = NULL, confirmed_at = NULL, confirm_email_at = now(),
                     consent_text = ${consent.consentText}, consent_ip = NULLIF(${consent.consentIp ?? ''}, ''),
                     consent_agent = NULLIF(${consent.consentAgent ?? ''}, ''), source = ${consent.source}, updated_at = now()
                 WHERE id = ${existing.id}`.affectedCount().build()
    )
    await sendConfirmationOrFail(existing.id, email, existing.token)
    return 'confirmation_sent'
  }

  const token = newToken()
  let createdId: string
  try {
    createdId = (await db.orm.public.NewsletterSubscriber.create({
      ...consent,
      email,
      token,
      status: 'PENDING',
      confirmEmailAt: toDbTimestamp(),
    } as never)).id
  } catch (err) {
    // Double submit raced us; the first request already sent the mail.
    const text = String((err as { message?: string })?.message ?? err) + JSON.stringify(err ?? {})
    if (/unique|duplicate key|23505/i.test(text)) return 'confirmation_recently_sent'
    throw err
  }
  await sendConfirmationOrFail(createdId, email, token)
  return 'confirmation_sent'
}

export type ConfirmResult =
  | { ok: true; email: string; code: string | null; codeUsed: boolean; firstTime: boolean }
  | { ok: false; reason: 'not_found' | 'unsubscribed' }

/**
 * Activates the subscription and hands out the welcome code. Safe to click twice,
 * even at the same moment: a fresh code is minted first, then the status switch and
 * the code are written in one conditional UPDATE. Only one request can win it; the
 * loser deletes its unused code and shows the winner's.
 */
export async function confirmNewsletter(token: string): Promise<ConfirmResult> {
  if (!token || token.length > 64) return { ok: false, reason: 'not_found' }
  const sub = await db.orm.public.NewsletterSubscriber.where({ token }).first()
  if (!sub) return { ok: false, reason: 'not_found' }
  if (sub.status === 'UNSUBSCRIBED') return { ok: false, reason: 'unsubscribed' }

  const firstTime = sub.status === 'PENDING'
  let couponId = sub.couponId

  if (firstTime) {
    // Someone coming back after unsubscribing keeps their original code; no new one.
    const minted = sub.couponId ? null : await createWelcomeCoupon(sub.email)
    // Either the code just minted or the one they already had; never null here.
    const nextCouponId = (minted?.id ?? sub.couponId) as string
    const { affectedRows } = await db.runtime().execute(
      db.raw.sql`UPDATE newsletter_subscribers
                 SET status = 'ACTIVE', confirmed_at = now(), updated_at = now(), coupon_id = ${nextCouponId}
                 WHERE id = ${sub.id} AND status = 'PENDING'`.affectedCount().build()
    )
    if (affectedRows === 1) {
      couponId = nextCouponId
      if (minted) {
        await sendWelcome(sub.email, sub.token, minted.code)
        await logAuditEvent({ action: 'NEWSLETTER_CONFIRMED', entity: 'NewsletterSubscriber', entityId: sub.id, metadata: { couponId } })
      }
    } else {
      if (minted) {
        await db.runtime().execute(db.raw.sql`DELETE FROM coupons WHERE id = ${minted.id} AND current_uses = 0`.affectedCount().build())
      }
      couponId = (await db.orm.public.NewsletterSubscriber.where({ id: sub.id }).first())?.couponId ?? null
    }
  }

  const coupon = couponId ? await db.orm.public.Coupon.where({ id: couponId }).first() : null
  return {
    ok: true,
    email: sub.email,
    code: coupon?.code ?? null,
    codeUsed: Boolean(coupon && coupon.maxUses !== null && coupon.currentUses >= (coupon.maxUses ?? 1)),
    firstTime,
  }
}

export async function unsubscribeNewsletter(token: string, messageId?: string): Promise<{ ok: boolean; email?: string }> {
  if (!token || token.length > 64) return { ok: false }
  const sub = await db.orm.public.NewsletterSubscriber.where({ token }).first()
  if (!sub) return { ok: false }
  if (sub.status !== 'UNSUBSCRIBED') {
    await db.orm.public.NewsletterSubscriber.where({ id: sub.id }).update({
      status: 'UNSUBSCRIBED',
      unsubscribedAt: toDbTimestamp(),
    } as never)
  }
  // Counted against the campaign mail it was clicked from (first time only; only that subscriber's own mail)
  if (messageId && messageId.length <= 64) {
    await db.runtime().execute(
      db.raw.sql`UPDATE email_messages SET unsubscribed_at = now() WHERE id = ${messageId} AND email = ${sub.email} AND unsubscribed_at IS NULL`.affectedCount().build()
    ).catch((err: unknown) => console.warn('[newsletter] could not record the unsubscribe on the campaign mail:', err))
  }
  return { ok: true, email: sub.email }
}

export type CheckoutConsentOutcome = 'subscribed' | 'already_active' | 'skipped'

/**
 * The buyer ticked the optional "campaign e-mails" box on the payment page. That is explicit consent
 * to commercial e-mail for the address they typed, so the address becomes an ACTIVE subscriber at once
 * (no confirmation mail, no welcome coupon) with the consent text, time, IP and browser saved as proof.
 * Every mail still carries the unsubscribe link. Someone who unsubscribed earlier and ticks the box
 * again has given fresh consent. Never throws: a problem here must not touch the order.
 */
export async function recordCheckoutEmailConsent(input: {
  email: unknown
  ip?: string | null
  userAgent?: string | null
}): Promise<CheckoutConsentOutcome> {
  try {
    const email = normalizeEmail(input.email)
    const consent = {
      text: CHECKOUT_MARKETING_CONSENT_TEXT,
      ip: input.ip?.slice(0, 64) ?? '',
      agent: input.userAgent?.slice(0, 300) ?? '',
    }
    const existing = await db.orm.public.NewsletterSubscriber.where({ email }).first()
    if (existing?.status === 'ACTIVE') return 'already_active'

    if (existing) {
      await db.runtime().execute(
        db.raw.sql`UPDATE newsletter_subscribers
                   SET status = 'ACTIVE', confirmed_at = now(), unsubscribed_at = NULL, source = 'checkout',
                       consent_text = ${consent.text}, consent_ip = NULLIF(${consent.ip}, ''), consent_agent = NULLIF(${consent.agent}, ''),
                       updated_at = now()
                   WHERE id = ${existing.id}`.affectedCount().build()
      )
      return 'subscribed'
    }

    await db.runtime().execute(
      db.raw.sql`INSERT INTO newsletter_subscribers (id, email, status, token, source, consent_text, consent_ip, consent_agent, confirmed_at, created_at, updated_at)
                 VALUES (${randomBytes(12).toString('hex')}, ${email}, 'ACTIVE', ${newToken()}, 'checkout', ${consent.text},
                         NULLIF(${consent.ip}, ''), NULLIF(${consent.agent}, ''), now(), now(), now())
                 ON CONFLICT (email) DO NOTHING`.affectedCount().build()
    )
    return 'subscribed'
  } catch (err) {
    console.warn('[newsletter] could not record the checkout consent:', err)
    return 'skipped'
  }
}

// ── Admin ────────────────────────────────────────────────────

export interface AdminSubscriber {
  id: string
  email: string
  status: 'PENDING' | 'ACTIVE' | 'UNSUBSCRIBED'
  source: string
  createdAt: string | null
  confirmedAt: string | null
  unsubscribedAt: string | null
  couponCode: string | null
  couponUsed: boolean
}

export async function adminListSubscribers(): Promise<{ subscribers: AdminSubscriber[]; counts: Record<string, number> }> {
  const rows = await db.orm.public.NewsletterSubscriber.orderBy((s) => s.createdAt.desc()).all()
  const couponIds = rows.map((r) => r.couponId).filter((id): id is string => Boolean(id))
  const coupons = couponIds.length ? await db.orm.public.Coupon.where((c) => c.id.in(couponIds)).all() : []
  const byId = new Map(coupons.map((c) => [c.id, c]))

  const subscribers = rows.map((r) => {
    const c = r.couponId ? byId.get(r.couponId) : undefined
    return {
      id: r.id,
      email: r.email,
      status: r.status as AdminSubscriber['status'],
      source: r.source,
      createdAt: dbTimestampToIso(r.createdAt),
      confirmedAt: dbTimestampToIso(r.confirmedAt),
      unsubscribedAt: dbTimestampToIso(r.unsubscribedAt),
      couponCode: c?.code ?? null,
      couponUsed: Boolean(c && c.currentUses > 0),
    }
  })
  const counts = { ACTIVE: 0, PENDING: 0, UNSUBSCRIBED: 0 } as Record<string, number>
  for (const s of subscribers) counts[s.status] = (counts[s.status] ?? 0) + 1
  return { subscribers, counts }
}

/** CSV of active subscribers for a mailing tool; consent date included as proof. */
export function subscribersToCsv(list: AdminSubscriber[]): string {
  // Quote every field; a value starting with = + - @ would run as a formula in Excel
  const esc = (v: string | null) => {
    const text = String(v ?? '')
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
    return `"${safe.replace(/"/g, '""')}"`
  }
  const lines = ['email,onay_tarihi,kayit_tarihi,kaynak']
  for (const s of list.filter((x) => x.status === 'ACTIVE')) {
    lines.push([esc(s.email), esc(s.confirmedAt), esc(s.createdAt), esc(s.source)].join(','))
  }
  return lines.join('\n')
}

/**
 * Removes a subscriber for good (e.g. test sign-ups). Their unused welcome code is
 * switched off so it cannot be redeemed; a code already used on an order is left
 * alone, since that order refers to it. The removal is written to the audit log.
 *
 * For real people who want to leave, prefer unsubscribing: it keeps the consent
 * history the law asks us to be able to show.
 */
export async function adminDeleteSubscriber(id: string, adminEmail = 'system'): Promise<{ email: string; codeDisabled: boolean }> {
  const row = await db.orm.public.NewsletterSubscriber.where({ id }).first()
  if (!row) throw new NewsletterError('Abone bulunamadı.')

  let codeDisabled = false
  await db.transaction(async (tx) => {
    await tx.orm.public.NewsletterSubscriber.where({ id }).delete()
    if (row.couponId) {
      const coupon = await tx.orm.public.Coupon.where({ id: row.couponId }).first()
      if (coupon && coupon.currentUses === 0 && coupon.isActive) {
        await tx.orm.public.Coupon.where({ id: coupon.id }).update({ isActive: false } as never)
        codeDisabled = true
      }
    }
  })

  await logAuditEvent({
    action: 'NEWSLETTER_SUBSCRIBER_DELETED',
    entity: 'NewsletterSubscriber',
    entityId: id,
    metadata: { email: row.email, status: row.status, codeDisabled, by: adminEmail },
  }).catch(() => {})
  return { email: row.email, codeDisabled }
}

/** Subscription state of one address, for the signed-in member's newsletter box */
export async function newsletterStatusFor(email: string): Promise<'ACTIVE' | 'PENDING' | 'UNSUBSCRIBED' | null> {
  const row = await db.orm.public.NewsletterSubscriber.where({ email: normalizeEmail(email) }).first()
  return (row?.status as 'ACTIVE' | 'PENDING' | 'UNSUBSCRIBED' | undefined) ?? null
}
