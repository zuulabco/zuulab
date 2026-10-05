/**
 * Two promises made in the privacy texts, against the real Postgres database (DATABASE_URL):
 *
 * 1. The optional "campaign e-mails" box on the payment page records consent for that address.
 * 2. Marketing data is removed when its retention period ends (browser identifiers stored with an
 *    order after 30 days, visit records after 14 months).
 *
 * The retention test passes its own clock (mid 2019) so it only touches its own 2019 rows: nothing
 * real, and nothing another test file is using. Every row is tagged with a run id and removed in
 * afterAll. Run with: npm run test:integration
 */
import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { db } = await import('@/prisma/db')
const { toDbTimestamp } = await import('@/lib/db/time')
const { recordCheckoutEmailConsent } = await import('@/lib/services/newsletter.service')
const { purgeExpiredPersonalData } = await import('@/lib/services/privacy-retention.service')
const { storeEvent } = await import('@/lib/services/analytics/internal-analytics.service')
const { CHECKOUT_MARKETING_CONSENT_TEXT } = await import('@/lib/newsletter/consent')

const RUN = `zk${Date.now().toString(36)}`
const run = (plan: Parameters<ReturnType<typeof db.runtime>['execute']>[0]) => db.runtime().execute(plan)
const addr = (key: string) => `${RUN}-${key}@example.com`
const find = (key: string) => db.orm.public.NewsletterSubscriber.where({ email: addr(key) }).first() as Promise<Record<string, any> | null>

describe('consent box on the payment page', () => {
  it('a new address becomes an active subscriber with proof of consent, and no welcome coupon', async () => {
    const outcome = await recordCheckoutEmailConsent({ email: `  ${addr('new').toUpperCase()} `, ip: '203.0.113.9', userAgent: 'TestBrowser/1.0' })
    expect(outcome).toBe('subscribed')
    const s = (await find('new'))!
    expect(s).toMatchObject({ status: 'ACTIVE', source: 'checkout', consentText: CHECKOUT_MARKETING_CONSENT_TEXT, consentIp: '203.0.113.9', consentAgent: 'TestBrowser/1.0' })
    expect(s.confirmedAt).not.toBeNull()
    expect(s.couponId ?? null).toBeNull()
    expect(s.token).toBeTruthy() // every mail can carry its own unsubscribe link
  })

  it('someone who never confirmed the newsletter, or who left it, is subscribed again by ticking the box', async () => {
    await db.orm.public.NewsletterSubscriber.create({ email: addr('pending'), token: `${RUN}-p`, status: 'PENDING', consentText: 'old', source: 'homepage' } as never)
    await db.orm.public.NewsletterSubscriber.create({ email: addr('left'), token: `${RUN}-l`, status: 'UNSUBSCRIBED', consentText: 'old', source: 'homepage' } as never)
    expect(await recordCheckoutEmailConsent({ email: addr('pending') })).toBe('subscribed')
    expect(await recordCheckoutEmailConsent({ email: addr('left') })).toBe('subscribed')
    for (const key of ['pending', 'left']) {
      const s = (await find(key))!
      expect(s).toMatchObject({ status: 'ACTIVE', source: 'checkout', consentText: CHECKOUT_MARKETING_CONSENT_TEXT })
      expect(s.unsubscribedAt ?? null).toBeNull()
    }
    expect((await find('pending'))!.token).toBe(`${RUN}-p`) // same token: earlier unsubscribe links keep working
  })

  it('an address that is already active is left alone', async () => {
    await db.orm.public.NewsletterSubscriber.create({ email: addr('active'), token: `${RUN}-a`, status: 'ACTIVE', consentText: 'homepage text', source: 'homepage' } as never)
    expect(await recordCheckoutEmailConsent({ email: addr('active') })).toBe('already_active')
    expect(await find('active')).toMatchObject({ source: 'homepage', consentText: 'homepage text' })
  })

  it('an invalid address records nothing and never throws, so the order cannot be hurt', async () => {
    expect(await recordCheckoutEmailConsent({ email: 'not-an-address' })).toBe('skipped')
    expect(await recordCheckoutEmailConsent({ email: undefined })).toBe('skipped')
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
  await db.close()
}, 60_000)
