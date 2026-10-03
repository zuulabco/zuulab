/**
 * Newsletter double opt-in and the single-use welcome code, against the real
 * database. Mail goes through the MOCK provider. Rows created here use a
 * run-only e-mail domain and are removed in afterAll.
 */
import 'dotenv/config'
import { afterAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/services/admin.service', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}))
process.env.EMAIL_PROVIDER = 'MOCK'

const { db } = await import('@/prisma/db')
const nl = await import('@/lib/services/newsletter.service')
const { resolveCoupon } = await import('@/lib/services/coupons.service')
const { adminGetCouponsWithStats } = await import('@/lib/services/coupons-admin.service')

const RUN = `itnl${Date.now().toString(36)}`
const email = (n: number) => `${RUN}.${n}@example.test`

async function row(addr: string) {
  return db.orm.public.NewsletterSubscriber.where({ email: addr }).first()
}

afterAll(async () => {
  await db.runtime().execute(db.raw.sql`DELETE FROM coupons WHERE assigned_email LIKE ${`${RUN}.%`}`.affectedCount().build())
  await db.runtime().execute(db.raw.sql`DELETE FROM newsletter_subscribers WHERE email LIKE ${`${RUN}.%`}`.affectedCount().build())
})

describe('newsletter', () => {
  it('needs a valid address and the consent box', async () => {
    await expect(nl.subscribeToNewsletter({ email: 'not-an-email', consent: true })).rejects.toThrow(/e-posta/)
    await expect(nl.subscribeToNewsletter({ email: email(0), consent: false })).rejects.toThrow(/onay/)
    expect(await row(email(0))).toBeNull()
  })

  it('subscribes as PENDING with the consent record, case-insensitively', async () => {
    const out = await nl.subscribeToNewsletter({ email: `  ${email(1).toUpperCase()} `, consent: true, ip: '203.0.113.7', userAgent: 'vitest' })
    expect(out).toBe('confirmation_sent')
    const sub = await row(email(1))
    expect(sub?.status).toBe('PENDING')
    expect(sub?.consentText).toMatch(/ticari elektronik ileti/)
    expect(sub?.consentIp).toBe('203.0.113.7')
    expect(sub?.couponId).toBeNull()
    // a second click right away does not mail again
    expect(await nl.subscribeToNewsletter({ email: email(1), consent: true })).toBe('confirmation_recently_sent')
  })

  it('confirming activates once and hands out one random single-use %10 code', async () => {
    const sub = (await row(email(1)))!
    const [a, b] = await Promise.all([nl.confirmNewsletter(sub.token), nl.confirmNewsletter(sub.token)])
    expect(a.ok && b.ok).toBe(true)
    const codes = [a, b].map((r) => (r.ok ? r.code : null))
    expect(codes[0]).toMatch(/^[A-HJKMNP-Z2-9]{10}$/)
    expect(codes[1]).toBe(codes[0])

    const coupons = await db.orm.public.Coupon.where({ assignedEmail: email(1) }).all()
    expect(coupons).toHaveLength(1)
    expect(coupons[0]).toMatchObject({ source: 'NEWSLETTER', maxUses: 1, maxUsesPerUser: 1, isActive: true, type: 'PERCENTAGE' })
    expect(Number(coupons[0].discountValue)).toBe(10)
    expect((await row(email(1)))?.status).toBe('ACTIVE')
    expect(await nl.subscribeToNewsletter({ email: email(1), consent: true })).toBe('already_active')
  })

  it('the code works once, then is refused', async () => {
    const coupon = (await db.orm.public.Coupon.where({ assignedEmail: email(1) }).first())!
    const ok = await resolveCoupon({ code: coupon.code.toLowerCase(), subtotal: 500 })
    expect(ok.coupon?.discountValue).toBe(10)

    await db.runtime().execute(db.raw.sql`UPDATE coupons SET current_uses = 1 WHERE id = ${coupon.id}`.affectedCount().build())
    const again = await resolveCoupon({ code: coupon.code, subtotal: 500 })
    expect(again.coupon).toBeNull()
    expect(again.error).toMatch(/limit/)
  })

  it('newsletter codes are listed apart from hand-made coupons', async () => {
    const manual = await adminGetCouponsWithStats('MANUAL')
    const fromNewsletter = await adminGetCouponsWithStats('NEWSLETTER')
    expect(manual.some((c) => c.assignedEmail === email(1))).toBe(false)
    expect(fromNewsletter.some((c) => c.assignedEmail === email(1))).toBe(true)
  })

  it('unsubscribing keeps the row; coming back never mints a second code', async () => {
    const sub = (await row(email(1)))!
    expect((await nl.unsubscribeNewsletter(sub.token)).ok).toBe(true)
    expect((await row(email(1)))?.status).toBe('UNSUBSCRIBED')
    expect((await nl.confirmNewsletter(sub.token)).ok).toBe(false)

    expect(await nl.subscribeToNewsletter({ email: email(1), consent: true })).toBe('confirmation_sent')
    const back = (await row(email(1)))!
    expect(back.token).not.toBe(sub.token)
    const res = await nl.confirmNewsletter(back.token)
    expect(res.ok && res.code).toBeTruthy()
    expect(await db.orm.public.Coupon.where({ assignedEmail: email(1) }).all()).toHaveLength(1)
  })

  it('rejects unknown tokens', async () => {
    expect((await nl.confirmNewsletter('nope')).ok).toBe(false)
    expect((await nl.unsubscribeNewsletter('nope')).ok).toBe(false)
  })
})
