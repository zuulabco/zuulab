/**
 * E-mail automations against the real Postgres database (DATABASE_URL): who the unpaid-order
 * reminder and the review request pick, and the restraint rules (once per order, one automatic
 * mail per address every 3 days, nothing at night, nothing while paused).
 *
 * NO REAL MAIL IS SENT: the e-mail provider is an in-memory fake. The clock is fixed in March 2019
 * (passed to the service), where the shop has no real orders, so the numbers can be asserted
 * exactly and no real customer can be picked. Rows are tagged with a run id and removed in afterAll;
 * the two automation rows are put back to the state they were in. Run with: npm run test:integration
 */
import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/services/admin.service', () => ({ logAuditEvent: vi.fn().mockResolvedValue(undefined) }))

// Commercial e-mail is switched off unless COMMERCIAL_EMAIL_ENABLED is true; these tests exercise the sending code with a fake provider
vi.stubEnv('COMMERCIAL_EMAIL_ENABLED', 'true')

interface Sent {
  to: string
  subject: string
  html: string
  headers?: Record<string, string>
  tags?: Array<{ name: string; value: string }>
}
const sentMails: Sent[] = []
let fakeIds = 0

vi.mock('@/lib/services/notification/email-provider.factory', () => ({
  getEmailProvider: () => ({
    providerName: 'FAKE',
    normalizeError: String,
    sendEmail: async (o: Sent) => {
      if (o.to.includes('-boom-')) return { success: false, error: 'mailbox rejected' }
      sentMails.push(o)
      return { success: true, providerMessageId: `rs_${RUN}_${++fakeIds}` }
    },
  }),
}))

const { db } = await import('@/prisma/db')
const { toDbTimestamp } = await import('@/lib/db/time')
const svc = await import('@/lib/services/email-automation.service')
const { getSigningSecret } = await import('@/lib/services/session.service')
const consent = await import('@/lib/services/email-consent.service')
const { verifyOptout } = await import('@/lib/email/automations')
const { escapeHtml } = await import('@/lib/email/campaign')

const RUN = `za${Date.now().toString(36)}`
const NOW = new Date('2019-03-12T10:00:00Z') // 13:00 in Türkiye
const hoursAgo = (h: number, from = NOW) => new Date(from.getTime() - h * 3_600_000)
const daysAgo = (d: number, from = NOW) => hoursAgo(d * 24, from)
const run = (plan: Parameters<ReturnType<typeof db.runtime>['execute']>[0]) => db.runtime().execute(plan)
const query = <T>(plan: unknown) => db.runtime().query(plan as never) as unknown as Promise<T[]>

const email = (key: string) => `${RUN}-${key}@example.com`
let productId = ''
let productName = ''
const userIds: Record<string, string> = {}
const wasActive: Record<string, boolean> = {}
let seq = 0

async function userOf(key: string) {
  if (!userIds[key]) userIds[key] = (await db.orm.public.User.create({ email: email(key), name: 'T', role: 'CUSTOMER', status: 'ACTIVE' } as never)).id
  return userIds[key]
}

/** The e-mail permission (what the automations need); NOT the newsletter */
async function permit(key: string, status: 'ACTIVE' | 'WITHDRAWN' | 'DECLINED' = 'ACTIVE') {
  await run(
    db.raw.sql`INSERT INTO email_consents (id, email, status, source, consent_text, created_at, updated_at)
               VALUES (${`${RUN}-c-${key}`}, ${email(key)}, ${status}, 'checkout', 'test', now(), now())`.affectedCount().build()
  )
}

/** A newsletter subscription: a different list, which must give the automations nothing */
async function subscribeToNewsletter(key: string, status: 'ACTIVE' | 'PENDING' | 'UNSUBSCRIBED' = 'ACTIVE') {
  await db.orm.public.NewsletterSubscriber.create({ email: email(key), token: `${RUN}-${key}`, status, consentText: 'test', source: 'test' } as never)
}

async function order(key: string, o: { status: string; createdAt: Date; payment?: { provider: 'MANUAL' | 'PAYTR'; status: string } }) {
  const created = await (db.orm.public.Order as any).create({
    orderNumber: `ZA-${RUN}-${++seq}`,
    userId: await userOf(key),
    email: email(key),
    status: o.status,
    subtotal: '100.00',
    total: '100.00',
    shipToName: 'T',
    shipToPhone: '0',
    shipToAddress: 'T',
    shipToCity: 'T',
    shipToDistrict: 'T',
    shipToPostal: '1',
    channel: 'DIRECT',
    createdAt: toDbTimestamp(o.createdAt),
  })
  await (db.orm.public.OrderItem as any).create({
    orderId: created.id, productId, productName, sku: 'ZA', quantity: 1, unitPrice: '100.00', taxRate: '20.00', total: '100.00',
  })
  if (o.payment) {
    await (db.orm.public.Payment as any).create({ orderId: created.id, provider: o.payment.provider, status: o.payment.status, amount: '100.00' })
  }
  return created.id as string
}

async function delivered(key: string, at: Date) {
  const id = await order(key, { status: 'DELIVERED', createdAt: daysAgo(12, at) })
  await (db.orm.public.OrderStatusHistory as any).create({ orderId: id, status: 'DELIVERED', createdAt: toDbTimestamp(at) })
  return id
}

const statusOf = async (key: string) => {
  const rows = await query<{ status: string; error: string | null }>(
    db.raw.sql`SELECT status, error FROM email_messages WHERE email = ${email(key)}`.returnsRow({ status: 'pg/text@1', error: 'pg/text@1' } as never).build()
  )
  return rows
}

beforeAll(async () => {
  const product = await db.orm.public.Product.select('id', 'name').first()
  if (!product) throw new Error('Integration tests need at least one product row.')
  productId = product.id
  productName = product.name

  // remember how the two automations were, then make sure they are paused
  for (const key of ['abandoned_payment', 'review_request'] as const) {
    wasActive[key] = (await svc.ensureAutomation(key)).active
    await svc.setAutomationActive(key, false, 'test')
  }

  // — unpaid orders —
  await permit('a1')
  await order('a1', { status: 'PAYMENT_PENDING', createdAt: hoursAgo(8) }) // older: only the latest order of an address counts
  await order('a1', { status: 'PAYMENT_FAILED', createdAt: hoursAgo(5) })
  await permit('a2', 'DECLINED')
  await order('a2', { status: 'PAYMENT_FAILED', createdAt: hoursAgo(5) }) // was asked and said no
  await subscribeToNewsletter('a3')
  await order('a3', { status: 'PAYMENT_FAILED', createdAt: hoursAgo(5) }) // newsletter subscriber only: never gave the e-mail permission
  await permit('a4')
  await order('a4', { status: 'PAYMENT_FAILED', createdAt: hoursAgo(5) })
  await order('a4', { status: 'CONFIRMED', createdAt: hoursAgo(4) }) // bought afterwards
  await permit('a5')
  await order('a5', { status: 'PAYMENT_FAILED', createdAt: hoursAgo(2) }) // too recent
  await permit('a6')
  await order('a6', { status: 'PAYMENT_FAILED', createdAt: hoursAgo(30) }) // too old
  await permit('a7')
  await order('a7', { status: 'PAYMENT_PENDING', createdAt: hoursAgo(5), payment: { provider: 'MANUAL', status: 'PENDING' } }) // paying by bank transfer
  await permit('a8')
  await order('a8', { status: 'PAYMENT_PENDING', createdAt: hoursAgo(5), payment: { provider: 'PAYTR', status: 'PROCESSING' } }) // payment under way
  await permit('boom-a9')
  await order('boom-a9', { status: 'PAYMENT_FAILED', createdAt: hoursAgo(5) }) // the fake provider rejects this address
  await order('a10', { status: 'PAYMENT_FAILED', createdAt: hoursAgo(5) }) // no permission at all (and not on the newsletter): a guest who never ticked the box

  // — delivered orders —
  await permit('r1')
  await delivered('r1', daysAgo(8, NOW))
  await permit('r2')
  await delivered('r2', daysAgo(3, NOW)) // too early
  await permit('r3')
  await delivered('r3', daysAgo(40, NOW)) // too late
  await permit('r4', 'WITHDRAWN')
  await delivered('r4', daysAgo(8, NOW)) // took the permission back
  await subscribeToNewsletter('r5')
  await delivered('r5', daysAgo(8, NOW)) // newsletter only
  await delivered('r6', daysAgo(8, NOW)) // delivered, no permission
  await delivered('a1', daysAgo(9, NOW)) // a1 also qualifies for a review request, but will already have had the reminder
}, 180_000)

afterAll(async () => {
  await run(db.raw.sql`DELETE FROM email_messages WHERE email LIKE ${`${RUN}-%`}`.affectedCount().build())
  await run(db.raw.sql`DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE order_number LIKE ${`ZA-${RUN}-%`})`.affectedCount().build())
  await run(db.raw.sql`DELETE FROM orders WHERE order_number LIKE ${`ZA-${RUN}-%`}`.affectedCount().build()) // items and history go with them
  await run(db.raw.sql`DELETE FROM users WHERE email LIKE ${`${RUN}-%`}`.affectedCount().build())
  await run(db.raw.sql`DELETE FROM newsletter_subscribers WHERE email LIKE ${`${RUN}-%`}`.affectedCount().build())
  await run(db.raw.sql`DELETE FROM email_consents WHERE email LIKE ${`${RUN}-%`}`.affectedCount().build())
  for (const key of ['abandoned_payment', 'review_request'] as const) await svc.setAutomationActive(key, wasActive[key] ?? false, 'test')
  await db.close()
}, 90_000)

const emails = (list: Array<{ email: string }>) => list.map((c) => c.email.replace(`${RUN}-`, '').replace('@example.com', '')).sort()

describe('who the rules pick', () => {
  it('unpaid orders: only the latest unpaid card order, 3 to 24 hours old, of an address with the e-mail permission that has not bought since', async () => {
    const found = await svc.findCandidates('abandoned_payment', NOW, 100)
    // a1 once (not twice), and boom-a9; not a2 (said no), a3 (newsletter only), a4 (bought), a5 (too recent), a6 (too old),
    // a7 (bank transfer), a8 (paying), a10 (never gave a permission)
    expect(emails(found)).toEqual(['a1', 'boom-a9'])
  })

  it('review request: delivered 7 to 30 days ago, only for addresses with the e-mail permission', async () => {
    const found = await svc.findCandidates('review_request', NOW, 100)
    // r1, and a1 (not yet blocked); not r2 (too early), r3 (too late), r4 (withdrew), r5 (newsletter only), r6 (no permission)
    expect(emails(found)).toEqual(['a1', 'r1'])
  })

  it('counts them for the admin without sending anything', async () => {
    sentMails.length = 0
    expect(await svc.countEligible('abandoned_payment', NOW)).toBeGreaterThanOrEqual(2)
    expect(sentMails).toHaveLength(0)
  })
})

describe('running the automations', () => {
  it('does nothing while an automation is paused (they start paused)', async () => {
    sentMails.length = 0
    const result = await svc.runAutomations({ now: NOW })
    expect(result.map((r) => [r.key, r.state, r.sent])).toEqual([['abandoned_payment', 'paused', 0], ['review_request', 'paused', 0]])
    expect(sentMails).toHaveLength(0)
  })

  it('does nothing at night (22:00 Türkiye), even when switched on', async () => {
    await svc.setAutomationActive('abandoned_payment', true, 'test')
    await svc.setAutomationActive('review_request', true, 'test')
    const night = new Date('2019-03-12T19:00:00Z')
    sentMails.length = 0
    const result = await svc.runAutomations({ now: night })
    expect(result.map((r) => r.state)).toEqual(['quiet_hours', 'quiet_hours'])
    expect(sentMails).toHaveLength(0)
  })

  it('sends the reminder and the request, and records each mail; one failing address does not stop the rest', async () => {
    sentMails.length = 0
    const result = await svc.runAutomations({ now: NOW })
    expect(result.find((r) => r.key === 'abandoned_payment')).toMatchObject({ state: 'sent', eligible: 2, sent: 1, failed: 1 })
    // a1 got the reminder a moment ago, so it is not mailed again for the review: only r1 is
    expect(result.find((r) => r.key === 'review_request')).toMatchObject({ state: 'sent', eligible: 1, sent: 1, failed: 0 })

    expect(sentMails.map((m) => m.to).sort()).toEqual([email('a1'), email('r1')])
    expect((await statusOf('a1')).map((m) => m.status)).toEqual(['SENT']) // one mail in total for a1
    expect((await statusOf('boom-a9'))[0]).toMatchObject({ status: 'FAILED', error: 'mailbox rejected' })
  })

  it('the reminder names the product and carries a signed link that takes the e-mail permission back (not a newsletter link)', async () => {
    const mail = sentMails.find((m) => m.to === email('a1'))!
    expect(mail.subject).toBe('sepetindeki ürünler seni bekliyor')
    expect(mail.html).toContain(escapeHtml(productName))
    expect(mail.html).toContain('İznimi geri alıyorum')
    expect(mail.html).not.toContain('/bulten/ayril')
    const link = /\/eposta\/ayril\?e=([^&"]+)&(?:amp;)?s=([^"&]+)/.exec(mail.html)!
    expect(verifyOptout(getSigningSecret(), decodeURIComponent(link[1]), decodeURIComponent(link[2]))).toBe(email('a1'))
    expect(mail.headers?.['List-Unsubscribe']).toContain('/api/email/optout?e=')
    expect(mail.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(mail.tags?.[0].name).toBe('campaign')
  })

  it('the review request carries the same kind of signed link for its own address', async () => {
    const mail = sentMails.find((m) => m.to === email('r1'))!
    expect(mail.subject).toBe('siparişin nasıldı?')
    expect(mail.html).toContain('İznimi geri alıyorum')
    const link = /\/eposta\/ayril\?e=([^&"]+)&(?:amp;)?s=([^"&]+)/.exec(mail.html)!
    expect(verifyOptout(getSigningSecret(), decodeURIComponent(link[1]), decodeURIComponent(link[2]))).toBe(email('r1'))
  })

  it('following the link in a mail takes the permission back, and the person is no longer picked', async () => {
    const mail = sentMails.find((m) => m.to === email('a1'))!
    const link = /\/eposta\/ayril\?e=([^&"]+)&(?:amp;)?s=([^"&]+)/.exec(mail.html)!
    const who = verifyOptout(getSigningSecret(), decodeURIComponent(link[1]), decodeURIComponent(link[2]))!
    expect(await consent.withdrawEmailConsent(who)).toBe(true)
    expect(await consent.getConsentStatus(email('a1'))).toBe('WITHDRAWN')
    await consent.grantEmailConsent({ email: email('a1'), source: 'checkout' }) // put it back for the rest of the run
  })

  it('running again sends nothing: every order is mailed once, an address at most every 3 days', async () => {
    sentMails.length = 0
    const result = await svc.runAutomations({ now: NOW })
    expect(result.map((r) => r.sent)).toEqual([0, 0])
    expect(sentMails).toHaveLength(0)
  })

  it('after 3 days a new order of the same address can be mailed, until the person opts out', async () => {
    const later = new Date(NOW.getTime() + 4 * 86_400_000)
    await delivered('r1', daysAgo(9, later)) // a second delivered order of r1, 9 days before "later"
    expect(emails(await svc.findCandidates('review_request', later, 100))).toContain('r1')

    await consent.withdrawEmailConsent(email('r1')) // the link in the mail
    expect(emails(await svc.findCandidates('review_request', later, 100))).not.toContain('r1')
  })

  it('while commercial e-mail is switched off nothing goes out even if an automation row says ACTIVE, and it cannot be switched on', async () => {
    vi.stubEnv('COMMERCIAL_EMAIL_ENABLED', 'false')
    try {
      const later = new Date(NOW.getTime() + 20 * 86_400_000) // a moment when a2/other orders would be eligible again
      sentMails.length = 0
      const result = await svc.runAutomations({ now: later })
      expect(result.map((r) => r.state)).toEqual(['paused', 'paused'])
      expect(sentMails).toHaveLength(0)
      await expect(svc.setAutomationActive('abandoned_payment', true, 'test')).rejects.toThrow(/İYS/)
      await svc.setAutomationActive('abandoned_payment', false, 'test') // switching off is always allowed
      await svc.setAutomationActive('abandoned_payment', false, 'test')
    } finally {
      vi.stubEnv('COMMERCIAL_EMAIL_ENABLED', 'true')
      await svc.setAutomationActive('abandoned_payment', true, 'test') // back to what the next test expects
    }
  })

  it('the numbers for the admin: what was sent, failed, and by which rule', async () => {
    const list = await svc.listAutomations()
    const abandoned = list.find((a) => a.key === 'abandoned_payment')!
    const review = list.find((a) => a.key === 'review_request')!
    expect(abandoned.counts).toMatchObject({ sent: 1, failed: 1 })
    expect(review.counts).toMatchObject({ sent: 1, failed: 0 })
    expect(abandoned.active).toBe(true)
  })
})
