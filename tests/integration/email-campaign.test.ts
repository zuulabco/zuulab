/**
 * E-mail campaigns against the real Postgres database (DATABASE_URL): sending to the confirmed
 * subscribers, recording every mail, and applying Resend's webhook events.
 *
 * NO REAL MAIL IS SENT: the e-mail provider is replaced by an in-memory fake that records what it
 * is asked to send. Real subscribers in the table are part of the audience (so they get message
 * rows in the fake run), which is why expectations are computed from the audience count. Every row
 * the test creates is tagged with a run id and removed in afterAll.
 * Run with: npm run test:integration
 */
import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/services/admin.service', () => ({ logAuditEvent: vi.fn().mockResolvedValue(undefined) }))

interface Sent {
  to: string
  subject: string
  html: string
  headers?: Record<string, string>
  tags?: Array<{ name: string; value: string }>
}
const sentMails: Sent[] = []
let failEverything = false
let batchCalls = 0
let fakeIds = 0 // never reset: Resend ids are unique across the whole run

vi.mock('@/lib/services/notification/email-provider.factory', () => ({
  getEmailProvider: () => ({
    providerName: 'FAKE',
    normalizeError: String,
    sendEmail: async (o: Sent) => (sentMails.push(o), { success: true, providerMessageId: `fake_${++fakeIds}` }),
    sendBatch: async (items: Sent[]) => {
      batchCalls++
      return items.map((o) => {
        if (failEverything || o.to.includes('-fail@')) return { success: false, error: failEverything ? 'Resend is down' : 'mailbox rejected' }
        sentMails.push(o)
        return { success: true, providerMessageId: `rs_${RUN}_${++fakeIds}` }
      })
    },
  }),
}))

const { db } = await import('@/prisma/db')
const svc = await import('@/lib/services/email-campaign.service')
const { unsubscribeNewsletter } = await import('@/lib/services/newsletter.service')

const RUN = `zc${Date.now().toString(36)}`
const run = (plan: Parameters<ReturnType<typeof db.runtime>['execute']>[0]) => db.runtime().execute(plan)
const query = <T>(plan: unknown) => db.runtime().query(plan as never) as unknown as Promise<T[]>

const content = { heading: 'Merhaba', paragraphs: ['Test içeriği.'], ctaLabel: 'Ürünler', ctaUrl: 'https://www.zuulab.com/urunler' }
const draft = (name: string) => ({ name: `${RUN} ${name}`, subject: `Konu ${name}`, preheader: 'Ön izleme', content })

const subs = { ok1: '', ok2: '', fail: '' }
const tokens: Record<string, string> = {}

async function addSubscriber(key: keyof typeof subs, email: string, status = 'ACTIVE') {
  const token = `${RUN}-${key}`
  const row = await db.orm.public.NewsletterSubscriber.create({ email, token, status, consentText: 'test', source: 'test' } as never)
  subs[key] = row.id
  tokens[key] = token
}

beforeAll(async () => {
  await addSubscriber('ok1', `${RUN}-ok1@example.com`)
  await addSubscriber('ok2', `${RUN}-ok2@example.com`)
  await addSubscriber('fail', `${RUN}-fail@example.com`)
}, 60_000)

afterAll(async () => {
  await run(db.raw.sql`DELETE FROM email_campaigns WHERE name LIKE ${`${RUN}%`}`.affectedCount().build()) // messages go with them
  await run(db.raw.sql`DELETE FROM email_webhook_events WHERE id LIKE ${`${RUN}%`}`.affectedCount().build())
  await run(db.raw.sql`DELETE FROM newsletter_subscribers WHERE email LIKE ${`${RUN}-%`}`.affectedCount().build())
  await db.close()
}, 60_000)

const counts = async (campaignId: string) =>
  (await svc.listCampaigns()).find((c) => c.id === campaignId)!

describe('sending a campaign', () => {
  it('a draft is saved, listed with zero numbers and can be changed; an invalid one is refused', async () => {
    const id = await svc.saveCampaign(draft('taslak'), undefined, 'test@zuulab.co')
    await svc.saveCampaign({ ...draft('taslak'), subject: 'Yeni konu' }, id, 'test@zuulab.co')
    const c = await counts(id)
    expect(c).toMatchObject({ status: 'DRAFT', subject: 'Yeni konu', recipientCount: 0 })
    expect(c.counts.sent).toBe(0)
    expect(c.rates.openRate).toBeNull()
    await expect(svc.saveCampaign({ ...draft('x'), subject: '' }, undefined, 'a')).rejects.toThrow()
    await svc.deleteCampaign(id)
    expect((await svc.listCampaigns()).some((x) => x.id === id)).toBe(false)
  })

  it('a test mail goes to one address only and is not recorded as a campaign mail', async () => {
    const id = await svc.saveCampaign(draft('test'), undefined, 'a')
    sentMails.length = 0
    await svc.sendTestEmail(id, 'admin@example.com')
    expect(sentMails).toHaveLength(1)
    expect(sentMails[0]).toMatchObject({ to: 'admin@example.com', subject: '[TEST] Konu test' })
    expect((await counts(id)).counts.sent).toBe(0)
    await expect(svc.sendTestEmail(id, 'not-an-address')).rejects.toThrow()
  })

  it('sends to every confirmed subscriber with their own unsubscribe link, records each mail, and tolerates one failing', async () => {
    const id = await svc.saveCampaign(draft('gonderim'), undefined, 'a')
    // a pending and an unsubscribed address must not be mailed
    await db.orm.public.NewsletterSubscriber.create({ email: `${RUN}-pending@example.com`, token: `${RUN}-p`, status: 'PENDING', consentText: 't', source: 't' } as never)
    await db.orm.public.NewsletterSubscriber.create({ email: `${RUN}-left@example.com`, token: `${RUN}-l`, status: 'UNSUBSCRIBED', consentText: 't', source: 't' } as never)
    const audience = await svc.countAudience()
    expect(audience).toBeGreaterThanOrEqual(3)

    sentMails.length = 0
    batchCalls = 0
    const result = await svc.sendCampaign(id, audience, 'admin@zuulab.co')
    expect(result).toEqual({ recipients: audience, sent: audience - 1, failed: 1 }) // our "-fail@" address is rejected by the fake
    expect(batchCalls).toBe(Math.ceil(audience / 50))
    expect(sentMails.map((m) => m.to)).not.toContain(`${RUN}-pending@example.com`)
    expect(sentMails.map((m) => m.to)).not.toContain(`${RUN}-left@example.com`)

    const ok1 = sentMails.find((m) => m.to === `${RUN}-ok1@example.com`)!
    expect(ok1.html).toContain(`t=${RUN}-ok1`) // its own unsubscribe token, not anyone else's
    expect(ok1.html).toMatch(/bulten\/ayril\?t=[^&"]+&amp;m=|bulten\/ayril\?t=[^&"]+&m=/) // and the message id for counting the unsubscribe
    expect(ok1.headers?.['List-Unsubscribe']).toContain('/api/newsletter/unsubscribe?t=')
    expect(ok1.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(ok1.tags).toEqual([{ name: 'campaign', value: id }])
    expect(ok1.html).toContain('Test içeriği.')

    const c = await counts(id)
    expect(c).toMatchObject({ status: 'SENT', recipientCount: audience })
    expect(c.counts).toMatchObject({ sent: audience - 1, failed: 1 })
    expect(c.sentAt).not.toBeNull()
  })

  it('the same campaign cannot be sent twice, and an old audience count is refused', async () => {
    const id = await svc.saveCampaign(draft('cift'), undefined, 'a')
    const audience = await svc.countAudience()
    await expect(svc.sendCampaign(id, audience + 1, 'a')).rejects.toThrow(/Abone sayısı değişti/)
    expect((await counts(id)).status).toBe('DRAFT') // nothing started
    sentMails.length = 0
    await svc.sendCampaign(id, audience, 'a')
    const after = sentMails.length
    await expect(svc.sendCampaign(id, audience, 'a')).rejects.toThrow(/zaten gönderildi/)
    expect(sentMails.length).toBe(after) // no second wave
    await expect(svc.saveCampaign(draft('cift'), id, 'a')).rejects.toThrow(/değiştirilemez/)
    await expect(svc.deleteCampaign(id)).rejects.toThrow(/taslak/)
  })

  it('when not one mail goes out, the campaign goes back to draft and leaves no mail records', async () => {
    const id = await svc.saveCampaign(draft('hatali'), undefined, 'a')
    const audience = await svc.countAudience()
    failEverything = true
    await expect(svc.sendCampaign(id, audience, 'a')).rejects.toThrow(/Resend is down/)
    failEverything = false
    const c = await counts(id)
    expect(c).toMatchObject({ status: 'DRAFT', recipientCount: 0 })
    expect(c.counts).toMatchObject({ sent: 0, failed: 0 })
    // and it can be sent once the cause is fixed
    expect((await svc.sendCampaign(id, audience, 'a')).sent).toBe(audience - 1)
  })
})

describe('applying Resend events', () => {
  let campaignId = ''
  let resendId = ''
  let messageId = ''

  beforeAll(async () => {
    campaignId = await svc.saveCampaign(draft('webhook'), undefined, 'a')
    const audience = await svc.countAudience()
    await svc.sendCampaign(campaignId, audience, 'a')
    const [row] = await query<{ id: string; resend_id: string }>(
      db.raw.sql`SELECT id, resend_id FROM email_messages WHERE campaign_id = ${campaignId} AND email = ${`${RUN}-ok1@example.com`}`
        .returnsRow({ id: 'pg/text@1', resend_id: 'pg/text@1' } as never)
        .build()
    )
    messageId = row.id
    resendId = row.resend_id
  }, 60_000)

  const event = (suffix: string, type: string, data: Record<string, unknown> = {}) =>
    svc.applyResendEvent(`${RUN}-evt-${suffix}`, { type, data: { email_id: resendId, ...data } })

  it('delivered, opened (twice), clicked: first times are kept and repeats counted', async () => {
    expect(await event('d', 'email.delivered')).toBe('applied')
    expect(await event('o1', 'email.opened')).toBe('applied')
    expect(await event('o2', 'email.opened')).toBe('applied')
    expect(await event('c', 'email.clicked')).toBe('applied')
    const [m] = await query<{ delivered_at: unknown; open_count: number; click_count: number; last_event: string }>(
      db.raw.sql`SELECT delivered_at, open_count, click_count, last_event FROM email_messages WHERE id = ${messageId}`
        .returnsRow({ delivered_at: 'pg/timestamp-temporal@1', open_count: 'pg/int4@1', click_count: 'pg/int4@1', last_event: 'pg/text@1' } as never)
        .build()
    )
    expect(m.delivered_at).not.toBeNull()
    expect(m).toMatchObject({ open_count: 2, click_count: 1, last_event: 'clicked' })
    const c = await counts(campaignId)
    expect(c.counts).toMatchObject({ delivered: 1, opened: 1, clicked: 1 }) // people, not events
  })

  it('the same delivery arriving again changes nothing', async () => {
    expect(await event('o1', 'email.opened')).toBe('duplicate')
    const [m] = await query<{ open_count: number }>(
      db.raw.sql`SELECT open_count FROM email_messages WHERE id = ${messageId}`.returnsRow({ open_count: 'pg/int4@1' } as never).build()
    )
    expect(m.open_count).toBe(2)
  })

  it('an event for a mail we do not know is ignored, unless it is tagged as a campaign mail (then Resend retries)', async () => {
    expect(await svc.applyResendEvent(`${RUN}-evt-x1`, { type: 'email.opened', data: { email_id: 'someone-elses-order-mail' } })).toBe('ignored')
    expect(await svc.applyResendEvent(`${RUN}-evt-x2`, { type: 'email.opened', data: { email_id: 'not-saved-yet', tags: [{ name: 'campaign', value: campaignId }] } })).toBe('retry')
    expect(await svc.applyResendEvent(`${RUN}-evt-x3`, { type: 'contact.created', data: { email_id: resendId } })).toBe('ignored')
  })

  it('a temporary bounce is recorded but keeps the subscriber; a permanent one stops mailing the address', async () => {
    await event('b1', 'email.bounced', { bounce: { type: 'Transient' } })
    let sub = await db.orm.public.NewsletterSubscriber.where({ id: subs.ok1 }).first()
    expect(sub?.status).toBe('ACTIVE')
    await event('b2', 'email.bounced', { bounce: { type: 'Permanent' } })
    sub = await db.orm.public.NewsletterSubscriber.where({ id: subs.ok1 }).first()
    expect(sub?.status).toBe('UNSUBSCRIBED')
    expect((await counts(campaignId)).counts.bounced).toBe(1)
  })

  it('a spam complaint unsubscribes the address', async () => {
    const [row] = await query<{ resend_id: string }>(
      db.raw.sql`SELECT resend_id FROM email_messages WHERE campaign_id = ${campaignId} AND email = ${`${RUN}-ok2@example.com`}`.returnsRow({ resend_id: 'pg/text@1' } as never).build()
    )
    await svc.applyResendEvent(`${RUN}-evt-cp`, { type: 'email.complained', data: { email_id: row.resend_id } })
    expect((await db.orm.public.NewsletterSubscriber.where({ id: subs.ok2 }).first())?.status).toBe('UNSUBSCRIBED')
    expect((await counts(campaignId)).counts.complained).toBe(1)
  })
})

describe('unsubscribing from a campaign mail', () => {
  it('is counted against that mail, only for the right address, and only once', async () => {
    const campaignId = await svc.saveCampaign(draft('ayril'), undefined, 'a')
    await db.orm.public.NewsletterSubscriber.where({ id: subs.fail }).update({ status: 'ACTIVE' } as never)
    await db.orm.public.NewsletterSubscriber.where({ id: subs.ok1 }).update({ status: 'ACTIVE' } as never)
    await svc.sendCampaign(campaignId, await svc.countAudience(), 'a')
    const [mine] = await query<{ id: string }>(
      db.raw.sql`SELECT id FROM email_messages WHERE campaign_id = ${campaignId} AND email = ${`${RUN}-ok1@example.com`}`.returnsRow({ id: 'pg/text@1' } as never).build()
    )

    // someone else's token with this mail's id does not count
    await unsubscribeNewsletter(tokens.ok2, mine.id)
    expect((await counts(campaignId)).counts.unsubscribed).toBe(0)

    expect(await unsubscribeNewsletter(tokens.ok1, mine.id)).toMatchObject({ ok: true })
    expect((await counts(campaignId)).counts.unsubscribed).toBe(1)
    await unsubscribeNewsletter(tokens.ok1, mine.id)
    expect((await counts(campaignId)).counts.unsubscribed).toBe(1)
    expect((await db.orm.public.NewsletterSubscriber.where({ id: subs.ok1 }).first())?.status).toBe('UNSUBSCRIBED')
  })
})
