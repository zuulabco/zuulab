import 'server-only'
import { randomBytes } from 'node:crypto'
import { db } from '@/prisma/db'
import { EMAIL_PERMISSION_TEXT } from '@/lib/newsletter/consent'

/**
 * The one permission to send a person commercial e-mail (ticari elektronik ileti): campaigns, offers,
 * reminders about an unpaid order, the review request.
 *
 * It is given in four places, always by an unticked box or an explicit "yes":
 * - the newsletter form, once the address is confirmed (source newsletter): this also puts the person on the
 *   newsletter, which is a topic on top of the permission (newsletter-only content goes only to subscribers);
 * - a signed-in member, in the modal shown after signing in (source member_modal) or in their account (source account);
 * - anyone, in the optional box on the payment page (source checkout).
 * The text shown, the time, the IP address and the browser are kept as proof.
 *
 * Taking it back stops ALL commercial e-mail: the link in any commercial mail (newsletter or automatic)
 * withdraws the permission and unsubscribes the newsletter too; the member can switch it on again under
 * Hesabım > Profilim > e-posta tercihleri.
 */

type Rec = Record<string, unknown>
const run = <T = Rec>(query: unknown) => db.runtime().query(query as never) as unknown as Promise<T[]>
const exec = (query: unknown) => db.runtime().execute(query as never) as unknown as Promise<{ affectedRows: number }>

export type ConsentStatus = 'NONE' | 'ACTIVE' | 'WITHDRAWN' | 'DECLINED'
export type ConsentSource = 'member_modal' | 'account' | 'checkout' | 'newsletter'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export class EmailConsentError extends Error {
  readonly isValidation = true
}

export function normalizeConsentEmail(input: unknown): string {
  const email = String(input ?? '').trim().toLowerCase()
  if (email.length > 254 || !EMAIL_RE.test(email)) throw new EmailConsentError('Geçerli bir e-posta adresi yazın.')
  return email
}

export async function getConsentStatus(email: string): Promise<ConsentStatus> {
  const [row] = await run<{ status: string }>(
    db.raw.sql`SELECT status FROM email_consents WHERE email = ${normalizeConsentEmail(email)}`.returnsRow({ status: 'pg/text@1' } as never).build()
  )
  return (row?.status as ConsentStatus | undefined) ?? 'NONE'
}

interface Proof {
  email: string
  source: ConsentSource
  /** The wording the person saw; defaults to EMAIL_PERMISSION_TEXT */
  text?: string
  userId?: string | null
  ip?: string | null
  userAgent?: string | null
}

const proofValues = (p: Proof) => ({
  id: randomBytes(12).toString('hex'),
  email: normalizeConsentEmail(p.email),
  ip: p.ip?.slice(0, 64) ?? '',
  agent: p.userAgent?.slice(0, 300) ?? '',
  userId: p.userId ?? '',
})

/** The person said yes. Returns false when they already had an active permission (nothing changes). */
export async function grantEmailConsent(p: Proof): Promise<boolean> {
  const v = proofValues(p)
  const text = p.text ?? EMAIL_PERMISSION_TEXT
  const { affectedRows } = await exec(
    db.raw.sql`INSERT INTO email_consents (id, email, status, source, consent_text, consent_ip, consent_agent, user_id, granted_at, created_at, updated_at)
               VALUES (${v.id}, ${v.email}, 'ACTIVE', ${p.source}, ${text}, NULLIF(${v.ip}, ''), NULLIF(${v.agent}, ''), NULLIF(${v.userId}, ''), now(), now(), now())
               ON CONFLICT (email) DO UPDATE SET
                 status = 'ACTIVE', source = EXCLUDED.source, consent_text = EXCLUDED.consent_text, consent_ip = EXCLUDED.consent_ip,
                 consent_agent = EXCLUDED.consent_agent, user_id = COALESCE(EXCLUDED.user_id, email_consents.user_id),
                 granted_at = now(), withdrawn_at = NULL, updated_at = now()
               WHERE email_consents.status <> 'ACTIVE'`.affectedCount().build()
  )
  return affectedRows > 0
}

/**
 * The person was asked and said no. Someone who had the permission loses it; someone who never had
 * it is recorded as having declined, so the modal does not ask again on every device.
 */
export async function declineEmailConsent(p: Proof): Promise<void> {
  const v = proofValues(p)
  await exec(
    db.raw.sql`INSERT INTO email_consents (id, email, status, source, consent_text, consent_ip, consent_agent, user_id, created_at, updated_at)
               VALUES (${v.id}, ${v.email}, 'DECLINED', ${p.source}, ${EMAIL_PERMISSION_TEXT}, NULLIF(${v.ip}, ''), NULLIF(${v.agent}, ''), NULLIF(${v.userId}, ''), now(), now())
               ON CONFLICT (email) DO UPDATE SET
                 status = CASE WHEN email_consents.status = 'ACTIVE' THEN 'WITHDRAWN' ELSE 'DECLINED' END,
                 withdrawn_at = CASE WHEN email_consents.status = 'ACTIVE' THEN now() ELSE email_consents.withdrawn_at END,
                 updated_at = now()`.affectedCount().build()
  )
}

/**
 * The person took the permission back (the link in any commercial mail, or the switch in their account).
 * This stops ALL commercial e-mail: the newsletter subscription ends too. True when anything was changed.
 */
export async function withdrawEmailConsent(email: string): Promise<boolean> {
  const address = normalizeConsentEmail(email)
  const consent = await exec(
    db.raw.sql`UPDATE email_consents SET status = 'WITHDRAWN', withdrawn_at = now(), updated_at = now()
               WHERE email = ${address} AND status = 'ACTIVE'`.affectedCount().build()
  )
  const newsletter = await exec(
    db.raw.sql`UPDATE newsletter_subscribers SET status = 'UNSUBSCRIBED', unsubscribed_at = now(), updated_at = now()
               WHERE email = ${address} AND status IN ('ACTIVE', 'PENDING')`.affectedCount().build()
  )
  return consent.affectedRows + newsletter.affectedRows > 0
}

/**
 * The optional box on the payment page was ticked. Never throws: a problem here must not touch the
 * order. Returns what happened, for the log and the tests.
 */
export async function recordCheckoutEmailConsent(input: {
  email: unknown
  userId?: string | null
  ip?: string | null
  userAgent?: string | null
}): Promise<'granted' | 'already_active' | 'skipped'> {
  try {
    const granted = await grantEmailConsent({ email: String(input.email ?? ''), source: 'checkout', userId: input.userId, ip: input.ip, userAgent: input.userAgent })
    return granted ? 'granted' : 'already_active'
  } catch (err) {
    console.warn('[email-consent] could not record the checkout consent:', err)
    return 'skipped'
  }
}

export async function consentCounts(): Promise<{ active: number; withdrawn: number; declined: number }> {
  const rows = await run<{ status: string; n: number }>(
    db.raw.sql`SELECT status, COUNT(*)::int AS n FROM email_consents GROUP BY status`.returnsRow({ status: 'pg/text@1', n: 'pg/int4@1' } as never).build()
  )
  const by = new Map(rows.map((r) => [String(r.status), Number(r.n)]))
  return { active: by.get('ACTIVE') ?? 0, withdrawn: by.get('WITHDRAWN') ?? 0, declined: by.get('DECLINED') ?? 0 }
}
