import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NEWSLETTER_CONSENT_TEXT, NEWSLETTER_CONSENT_TEXT_WITH_REMINDERS, newsletterConsentText } from '@/lib/newsletter/consent'

/**
 * While commercial e-mail is switched off (COMMERCIAL_EMAIL_ENABLED unset) no e-mail permission is offered or
 * collected: not by the account API, not by the payment page, and the newsletter keeps its original wording.
 */
const calls: string[] = []
vi.mock('@/lib/services/auth.service', () => ({ requireAuth: async () => ({ id: 'user-1', email: 'ali@example.com' }) }))
vi.mock('@/prisma/db', () => ({
  db: { raw: { sql: () => ({ returnsRow: () => ({ build: () => ({}) }) }) }, runtime: () => ({ query: async () => [{ v: true }] }) },
}))
vi.mock('@/lib/services/email-consent.service', () => ({
  getConsentStatus: async () => 'NONE',
  grantEmailConsent: async () => (calls.push('grant'), true),
  declineEmailConsent: async () => void calls.push('decline'),
  withdrawEmailConsent: async () => (calls.push('withdraw'), true),
}))
vi.mock('@/lib/services/newsletter.service', () => ({ newsletterStatusFor: async () => null }))

beforeEach(() => {
  calls.length = 0
  delete process.env.COMMERCIAL_EMAIL_ENABLED
})
afterEach(() => vi.unstubAllEnvs())

const post = async (answer: string) => {
  const { POST } = await import('@/app/api/account/email-consent/route')
  return POST(new Request('https://zuulab.com/api/account/email-consent', { method: 'POST', body: JSON.stringify({ answer }) }))
}

describe('account e-mail permission while commercial e-mail is switched off', () => {
  it('nobody is eligible to be asked, even with a verified address', async () => {
    const { GET } = await import('@/app/api/account/email-consent/route')
    expect(await (await GET(new Request('https://zuulab.com/x'))).json()).toMatchObject({ success: true, status: 'NONE', eligible: false })
  })

  it('a "yes" is refused and nothing is recorded; taking a permission back still works', async () => {
    const res = await post('accept')
    expect(res.status).toBe(403)
    expect((await res.json()).error).toContain('İYS')
    expect(calls).toEqual([])
    expect((await post('withdraw')).status).toBe(200)
    expect(calls).toEqual(['withdraw'])
  })

  it('switched on, a verified member is eligible and can say yes', async () => {
    vi.stubEnv('COMMERCIAL_EMAIL_ENABLED', 'true')
    const { GET } = await import('@/app/api/account/email-consent/route')
    expect(await (await GET(new Request('https://zuulab.com/x'))).json()).toMatchObject({ eligible: true })
    expect((await post('accept')).status).toBe(200)
    expect(calls).toEqual(['grant'])
  })
})

describe('the public flag the storefront asks', () => {
  it('says whether commercial e-mail is on, and nothing else', async () => {
    const { GET } = await import('@/app/api/email/features/route')
    expect(await (await GET()).json()).toEqual({ commercial: false })
    vi.stubEnv('COMMERCIAL_EMAIL_ENABLED', 'true')
    expect(await (await GET()).json()).toEqual({ commercial: true })
  })
})

describe('newsletter wording', () => {
  it('keeps the original text while the switch is off and adds the reminders only once it is on', () => {
    expect(newsletterConsentText(false)).toBe(NEWSLETTER_CONSENT_TEXT)
    expect(newsletterConsentText(true)).toBe(NEWSLETTER_CONSENT_TEXT_WITH_REMINDERS)
    expect(NEWSLETTER_CONSENT_TEXT).not.toMatch(/hatırlatma/)
    expect(NEWSLETTER_CONSENT_TEXT_WITH_REMINDERS).toMatch(/hatırlatma/)
  })
})
