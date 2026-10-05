/**
 * Two promises made in the privacy texts, against the real Postgres database (DATABASE_URL):
 *
 * 1. The e-mail permission (member modal, optional box on the payment page) is recorded with proof,
 *    can be declined and withdrawn, and is NOT a newsletter subscription.
 * 2. Marketing data is removed when its retention period ends (browser identifiers stored with an
 *    order after 30 days, visit records after 14 months).
 *
 * The retention test passes its own clock (mid 2019) so it only touches its own 2019 rows: nothing
 * real, and nothing another test file is using. Every row is tagged with a run id and removed in
 * afterAll. Run with: npm run test:integration
 */
import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// The e-mail permission is only collected while commercial e-mail is switched on
vi.stubEnv('COMMERCIAL_EMAIL_ENABLED', 'true')

// Confirming a newsletter sign-up sends a welcome mail and mints a coupon: no real mail goes out
vi.mock('@/lib/services/admin.service', () => ({ logAuditEvent: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/services/notification/email-provider.factory', () => ({
  getEmailProvider: () => ({ providerName: 'FAKE', normalizeError: String, sendEmail: async () => ({ success: true, providerMessageId: 'fake' }) }),
}))

const { db } = await import('@/prisma/db')
const news = await import('@/lib/services/newsletter.service')
const { toDbTimestamp } = await import('@/lib/db/time')
const consent = await import('@/lib/services/email-consent.service')
const { purgeExpiredPersonalData } = await import('@/lib/services/privacy-retention.service')
const { storeEvent } = await import('@/lib/services/analytics/internal-analytics.service')
const { EMAIL_PERMISSION_TEXT, NEWSLETTER_CONSENT_TEXT_WITH_REMINDERS: NEWSLETTER_CONSENT_TEXT } = await import('@/lib/newsletter/consent')

const RUN = `zk${Date.now().toString(36)}`
const run = (plan: Parameters<ReturnType<typeof db.runtime>['execute']>[0]) => db.runtime().execute(plan)
const addr = (key: string) => `${RUN}-${key}@example.com`

interface ConsentRow {
  status: string
  source: string
  consent_text: string
  consent_ip: string | null
  consent_agent: string | null
  user_id: string | null
  granted: boolean
  withdrawn: boolean
}

const row = async (key: string): Promise<ConsentRow | null> => {
  const rows = (await db.runtime().query(
    db.raw.sql`SELECT status, source, consent_text, consent_ip, consent_agent, user_id,
                      (granted_at IS NOT NULL) AS granted, (withdrawn_at IS NOT NULL) AS withdrawn
               FROM email_consents WHERE email = ${addr(key)}`
      .returnsRow({
        status: 'pg/text@1', source: 'pg/text@1', consent_text: 'pg/text@1', consent_ip: 'pg/text@1', consent_agent: 'pg/text@1',
        user_id: 'pg/text@1', granted: 'pg/bool@1', withdrawn: 'pg/bool@1',
      } as never)
      .build() as never
  )) as unknown as ConsentRow[]
  return rows[0] ?? null
}

const newsletterRows = async (key: string) => (await db.orm.public.NewsletterSubscriber.where({ email: addr(key) }).all()).length

describe('e-mail permission', () => {
  it('a payment-page tick creates an active permission with proof, and does not subscribe to the newsletter', async () => {
    const outcome = await consent.recordCheckoutEmailConsent({ email: `  ${addr('new').toUpperCase()} `, ip: '203.0.113.9', userAgent: 'TestBrowser/1.0' })
    expect(outcome).toBe('granted')
    expect(await row('new')).toMatchObject({
      status: 'ACTIVE', source: 'checkout', consent_text: EMAIL_PERMISSION_TEXT, consent_ip: '203.0.113.9', consent_agent: 'TestBrowser/1.0', granted: true,
    })
    expect(await newsletterRows('new')).toBe(0) // the newsletter is a different list
    expect(await consent.getConsentStatus(addr('new'))).toBe('ACTIVE')
  })

  it('a member who says yes in the modal gets one with their account id; asking twice changes nothing', async () => {
    expect(await consent.grantEmailConsent({ email: addr('member'), source: 'member_modal', userId: 'user-123' })).toBe(true)
    expect(await row('member')).toMatchObject({ status: 'ACTIVE', source: 'member_modal', user_id: 'user-123' })
    expect(await consent.grantEmailConsent({ email: addr('member'), source: 'checkout' })).toBe(false)
    expect(await row('member')).toMatchObject({ source: 'member_modal' }) // the first proof stays
  })

  it('a member who says no is recorded as declined, so no device asks again', async () => {
    await consent.declineEmailConsent({ email: addr('no'), source: 'member_modal' })
    expect(await consent.getConsentStatus(addr('no'))).toBe('DECLINED')
    expect(await row('no')).toMatchObject({ status: 'DECLINED', granted: false })
  })

  it('withdrawing takes the permission back, it can be given again later, and an address with none is unaffected', async () => {
    expect(await consent.withdrawEmailConsent(addr('member'))).toBe(true)
    expect(await row('member')).toMatchObject({ status: 'WITHDRAWN', withdrawn: true })
    expect(await consent.withdrawEmailConsent(addr('member'))).toBe(false) // already withdrawn
    expect(await consent.withdrawEmailConsent(addr('nobody'))).toBe(false)

    expect(await consent.grantEmailConsent({ email: addr('member'), source: 'checkout' })).toBe(true)
    expect(await row('member')).toMatchObject({ status: 'ACTIVE', source: 'checkout', withdrawn: false })
  })

  it('saying no after having said yes withdraws it', async () => {
    await consent.grantEmailConsent({ email: addr('flip'), source: 'member_modal' })
    await consent.declineEmailConsent({ email: addr('flip'), source: 'member_modal' })
    expect(await row('flip')).toMatchObject({ status: 'WITHDRAWN' })
  })

  it('subscribing to the newsletter gives no e-mail permission', async () => {
    await db.orm.public.NewsletterSubscriber.create({ email: addr('news'), token: `${RUN}-n`, status: 'ACTIVE', consentText: 'newsletter', source: 'homepage' } as never)
    expect(await consent.getConsentStatus(addr('news'))).toBe('NONE')
  })

  it('an invalid address records nothing and never throws, so the order cannot be hurt', async () => {
    expect(await consent.recordCheckoutEmailConsent({ email: 'not-an-address' })).toBe('skipped')
    expect(await consent.recordCheckoutEmailConsent({ email: undefined })).toBe('skipped')
  })

  it('counts by status for the admin', async () => {
    const c = await consent.consentCounts()
    expect(c.active).toBeGreaterThanOrEqual(2) // new and member
    expect(c.declined).toBeGreaterThanOrEqual(1)
    expect(c.withdrawn).toBeGreaterThanOrEqual(1)
  })
})

describe('one permission, two ways in, one way out', () => {
  const pending = (key: string, consentText: string) =>
    db.orm.public.NewsletterSubscriber.create({ email: addr(key), token: `${RUN}-t-${key}`, status: 'PENDING', consentText, source: 'homepage' } as never)
  const newsletterStatus = async (key: string) => (await db.orm.public.NewsletterSubscriber.where({ email: addr(key) }).first())?.status

  it('confirming the newsletter form also gives the e-mail permission, because its wording covers reminders and offers', async () => {
    await pending('form', NEWSLETTER_CONSENT_TEXT)
    expect(await consent.getConsentStatus(addr('form'))).toBe('NONE') // not before it is confirmed
    expect((await news.confirmNewsletter(`${RUN}-t-form`)).ok).toBe(true)
    expect(await newsletterStatus('form')).toBe('ACTIVE')
    expect(await row('form')).toMatchObject({ status: 'ACTIVE', source: 'newsletter', consent_text: NEWSLETTER_CONSENT_TEXT })
  })

  it('a sign-up that saw the older wording (no reminders in it) becomes a subscriber but gets no e-mail permission', async () => {
    await pending('old', 'zuulab yeniliklerinden, kampanyalarından ve indirimlerinden e-posta ile haberdar olmak için onay veriyorum.')
    await news.confirmNewsletter(`${RUN}-t-old`)
    expect(await newsletterStatus('old')).toBe('ACTIVE')
    expect(await consent.getConsentStatus(addr('old'))).toBe('NONE')
  })

  it('leaving the newsletter by its own link stops all commercial e-mail', async () => {
    expect((await news.unsubscribeNewsletter(`${RUN}-t-form`)).ok).toBe(true)
    expect(await newsletterStatus('form')).toBe('UNSUBSCRIBED')
    expect(await consent.getConsentStatus(addr('form'))).toBe('WITHDRAWN')
  })

  it('the link in an automatic mail takes back the permission and also ends the newsletter', async () => {
    await consent.grantEmailConsent({ email: addr('both'), source: 'checkout' })
    await db.orm.public.NewsletterSubscriber.create({ email: addr('both'), token: `${RUN}-t-both`, status: 'ACTIVE', consentText: 'x', source: 'homepage' } as never)
    expect(await consent.withdrawEmailConsent(addr('both'))).toBe(true)
    expect(await consent.getConsentStatus(addr('both'))).toBe('WITHDRAWN')
    expect(await newsletterStatus('both')).toBe('UNSUBSCRIBED')
  })

  it('an address that is only on the newsletter list (an older subscriber) is also stopped by that link', async () => {
    await db.orm.public.NewsletterSubscriber.create({ email: addr('legacy'), token: `${RUN}-t-legacy`, status: 'ACTIVE', consentText: 'old', source: 'homepage' } as never)
    expect(await consent.withdrawEmailConsent(addr('legacy'))).toBe(true)
    expect(await newsletterStatus('legacy')).toBe('UNSUBSCRIBED')
  })

  it('a member can switch it on again afterwards', async () => {
    expect(await consent.grantEmailConsent({ email: addr('form'), source: 'account', userId: 'u1' })).toBe(true)
    expect(await row('form')).toMatchObject({ status: 'ACTIVE', source: 'account' })
    expect(await newsletterStatus('form')).toBe('UNSUBSCRIBED') // the newsletter is a separate choice: it stays off
  })
})

describe('while commercial e-mail is switched off', () => {
  const off = async <T>(fn: () => Promise<T>): Promise<T> => {
    vi.stubEnv('COMMERCIAL_EMAIL_ENABLED', 'false')
    try {
      return await fn()
    } finally {
      vi.stubEnv('COMMERCIAL_EMAIL_ENABLED', 'true')
    }
  }
  const stored = async (key: string) => (await db.orm.public.NewsletterSubscriber.where({ email: addr(key) }).first()) as Record<string, any> | null

  it('the payment-page box records nothing, even if the browser sends it as ticked', async () => {
    expect(await off(() => consent.recordCheckoutEmailConsent({ email: addr('off1') }))).toBe('skipped')
    expect(await consent.getConsentStatus(addr('off1'))).toBe('NONE')
  })

  it('no permission can be given at all', async () => {
    await expect(off(() => consent.grantEmailConsent({ email: addr('off2'), source: 'member_modal' }))).rejects.toThrow(/İYS/)
    expect(await consent.getConsentStatus(addr('off2'))).toBe('NONE')
  })

  it('the newsletter form still works, with its original wording, and confirming it gives no e-mail permission', async () => {
    await off(async () => {
      await news.subscribeToNewsletter({ email: addr('off3'), consent: true, source: 'test' })
      expect((await stored('off3'))?.consentText).toBe((await import('@/lib/newsletter/consent')).NEWSLETTER_CONSENT_TEXT)
      const token = (await stored('off3'))!.token as string
      expect((await news.confirmNewsletter(token)).ok).toBe(true)
    })
    expect((await stored('off3'))?.status).toBe('ACTIVE')
    expect(await consent.getConsentStatus(addr('off3'))).toBe('NONE')
  })

  it('a sign-up that carries the wording with reminders still gets no permission while it is off', async () => {
    await db.orm.public.NewsletterSubscriber.create({ email: addr('off4'), token: `${RUN}-t-off4`, status: 'PENDING', consentText: NEWSLETTER_CONSENT_TEXT, source: 'homepage' } as never)
    await off(() => news.confirmNewsletter(`${RUN}-t-off4`))
    expect(await consent.getConsentStatus(addr('off4'))).toBe('NONE')
  })

  it('once it is on, the form carries the wording with reminders', async () => {
    await news.subscribeToNewsletter({ email: addr('on1'), consent: true, source: 'test' })
    expect((await stored('on1'))?.consentText).toBe(NEWSLETTER_CONSENT_TEXT)
  })
})

describe('retention periods', () => {
  const NOW = new Date('2019-06-01T00:00:00Z')
  const at = (iso: string) => new Date(iso)
  let userId = ''

  async function order(n: number, createdAt: Date, attribution: object) {
    return (db.orm.public.Order as any).create({
      orderNumber: `ZK-${RUN}-${n}`, userId, status: 'CONFIRMED', subtotal: '10.00', total: '10.00',
      shipToName: 'T', shipToPhone: '0', shipToAddress: 'T', shipToCity: 'T', shipToDistrict: 'T', shipToPostal: '1',
      channel: 'DIRECT', attribution, createdAt: toDbTimestamp(createdAt),
    })
  }
  const attributionOf = async (n: number) =>
    ((await db.orm.public.Order.where({ orderNumber: `ZK-${RUN}-${n}` }).first()) as Record<string, any>).attribution
  const eventExists = async (id: string) => {
    const rows = (await db.runtime().query(
      db.raw.sql`SELECT COUNT(*)::int AS n FROM marketing_events WHERE event_id = ${id}`.returnsRow({ n: 'pg/int4@1' } as never).build() as never
    )) as unknown as Array<{ n: number }>
    return rows[0].n === 1
  }
  const meta = { ip: '203.0.113.9', userAgent: 'UA', fbp: 'fb.1.1.1', fbc: 'fb.1.1.abc' }
  const event = (id: string, occurredAt: Date) =>
    storeEvent({ eventId: `${RUN}-${id}`, name: 'page_view', occurredAt, anonymousId: 'x', sessionId: 's', productId: null, value: null, pagePath: '/', utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null })

  beforeAll(async () => {
    userId = (await db.orm.public.User.create({ email: addr('owner'), name: 'T', role: 'CUSTOMER', status: 'ACTIVE' } as never)).id
    await order(1, at('2019-03-01T10:00:00Z'), { last: { utmSource: 'meta' }, meta }) // 92 days old: identifiers go
    await order(2, at('2019-05-20T10:00:00Z'), { last: { utmSource: 'meta' }, meta }) // 12 days old: kept
    await order(3, at('2019-03-01T10:00:00Z'), { last: { utmSource: 'google' } }) // old but has no identifiers: untouched
    await event('old', at('2018-01-01T10:00:00Z')) // 17 months: deleted
    await event('recent', at('2019-01-01T10:00:00Z')) // 5 months: kept
  }, 60_000)

  it('removes the browser identifiers of old orders, keeps the campaign, and leaves young orders alone', async () => {
    const result = await purgeExpiredPersonalData(NOW)
    expect(result.ordersCleaned).toBeGreaterThanOrEqual(1)
    expect(await attributionOf(1)).toEqual({ last: { utmSource: 'meta' } }) // the campaign is not personal data and stays
    expect(await attributionOf(2)).toEqual({ last: { utmSource: 'meta' }, meta })
    expect(await attributionOf(3)).toEqual({ last: { utmSource: 'google' } })
  })

  it('deletes visit records older than 14 months and keeps the rest', async () => {
    expect(await eventExists(`${RUN}-old`)).toBe(false)
    expect(await eventExists(`${RUN}-recent`)).toBe(true)
  })

  it('running it again changes nothing', async () => {
    const again = await purgeExpiredPersonalData(NOW)
    expect(again.ordersCleaned).toBe(0)
    expect(again.eventsDeleted).toBe(0)
  })
})

afterAll(async () => {
  await run(db.raw.sql`DELETE FROM marketing_events WHERE event_id LIKE ${`${RUN}-%`}`.affectedCount().build())
  await run(db.raw.sql`DELETE FROM orders WHERE order_number LIKE ${`ZK-${RUN}-%`}`.affectedCount().build())
  await run(db.raw.sql`DELETE FROM users WHERE email LIKE ${`${RUN}-%`}`.affectedCount().build())
  await run(db.raw.sql`DELETE FROM newsletter_subscribers WHERE email LIKE ${`${RUN}-%`}`.affectedCount().build())
  await run(db.raw.sql`DELETE FROM coupons WHERE assigned_email LIKE ${`${RUN}-%`}`.affectedCount().build())
  await run(db.raw.sql`DELETE FROM email_consents WHERE email LIKE ${`${RUN}-%`}`.affectedCount().build())
  await db.close()
}, 60_000)
