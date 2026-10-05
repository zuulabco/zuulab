import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * /api/account/email-consent: what the modal after sign-in talks to. The database and the consent
 * service are replaced; what is checked is who may do what.
 */
let signedIn = true
let verified = true
let status: 'NONE' | 'ACTIVE' | 'WITHDRAWN' | 'DECLINED' = 'NONE'
const calls: Array<[string, Record<string, unknown>]> = []

vi.mock('@/lib/services/auth.service', () => ({
  requireAuth: async () => {
    if (!signedIn) throw new Error('UNAUTHORIZED')
    return { id: 'user-1', email: 'Ali@Example.com' }
  },
}))
vi.mock('@/prisma/db', () => ({
  db: {
    raw: { sql: () => ({ returnsRow: () => ({ build: () => ({}) }) }) },
    runtime: () => ({ query: async () => [{ v: verified }] }),
  },
}))
vi.mock('@/lib/services/email-consent.service', () => ({
  getConsentStatus: async () => status,
  grantEmailConsent: async (p: Record<string, unknown>) => (calls.push(['grant', p]), (status = 'ACTIVE'), true),
  declineEmailConsent: async (p: Record<string, unknown>) => (calls.push(['decline', p]), (status = status === 'ACTIVE' ? 'WITHDRAWN' : 'DECLINED')),
  withdrawEmailConsent: async (email: string) => (calls.push(['withdraw', { email }]), (status = 'WITHDRAWN'), true),
}))
vi.mock('@/lib/services/newsletter.service', () => ({ newsletterStatusFor: async () => 'ACTIVE' }))

const route = () => import('@/app/api/account/email-consent/route')
const post = async (body: unknown) => {
  const { POST } = await route()
  return POST(new Request('https://zuulab.com/api/account/email-consent', { method: 'POST', headers: { 'user-agent': 'TestBrowser', 'x-forwarded-for': '203.0.113.9' }, body: JSON.stringify(body) }))
}

beforeEach(() => {
  signedIn = true
  verified = true
  status = 'NONE'
  calls.length = 0
})

describe('GET: what the modal needs to know', () => {
  it('needs a signed-in member', async () => {
    signedIn = false
    const { GET } = await route()
    expect((await GET(new Request('https://zuulab.com/api/account/email-consent'))).status).toBe(401)
  })

  it('reports the member\'s status and whether their address is verified (only then is the modal shown)', async () => {
    const { GET } = await route()
    expect(await (await GET(new Request('https://zuulab.com/x'))).json()).toMatchObject({ success: true, status: 'NONE', eligible: true })
    verified = false
    expect(await (await GET(new Request('https://zuulab.com/x'))).json()).toMatchObject({ eligible: false })
    status = 'ACTIVE'
    expect(await (await GET(new Request('https://zuulab.com/x'))).json()).toMatchObject({ status: 'ACTIVE' })
  })
})

describe('GET: newsletter status', () => {
  it('also reports the newsletter status, for the e-mail preferences in the account', async () => {
    const { GET } = await route()
    expect(await (await GET(new Request('https://zuulab.com/x'))).json()).toMatchObject({ newsletter: 'ACTIVE' })
  })
})

describe('POST: the answer', () => {
  it('"yes" gives the permission for the account address, with the proof, and answers with the new status', async () => {
    const res = await post({ answer: 'accept' })
    expect(await res.json()).toMatchObject({ success: true, status: 'ACTIVE' })
    expect(calls).toHaveLength(1)
    expect(calls[0][0]).toBe('grant')
    expect(calls[0][1]).toMatchObject({ email: 'Ali@Example.com', source: 'member_modal', userId: 'user-1', ip: '203.0.113.9', userAgent: 'TestBrowser' })
  })

  it('"yes" from an address that is not verified is refused: nobody can give a permission in someone else\'s name', async () => {
    verified = false
    const res = await post({ answer: 'accept' })
    expect(res.status).toBe(400)
    expect(calls).toHaveLength(0)
    expect(status).toBe('NONE')
  })

  it('"no" is recorded (so no device asks again), even for an unverified address, and takes back an earlier "yes"', async () => {
    verified = false
    expect(await (await post({ answer: 'decline' })).json()).toMatchObject({ success: true, status: 'DECLINED' })
    status = 'ACTIVE'
    expect(await (await post({ answer: 'decline' })).json()).toMatchObject({ success: true, status: 'WITHDRAWN' })
    expect(calls.map((c) => c[0])).toEqual(['decline', 'decline'])
  })

  it('the switch in the account takes it back (even for an unverified address) and records where it was given', async () => {
    verified = false
    status = 'ACTIVE'
    expect(await (await post({ answer: 'withdraw', from: 'account' })).json()).toMatchObject({ success: true, status: 'WITHDRAWN' })
    verified = true
    expect(await (await post({ answer: 'accept', from: 'account' })).json()).toMatchObject({ success: true, status: 'ACTIVE' })
    expect(calls.map((c) => c[0])).toEqual(['withdraw', 'grant'])
    expect(calls[1][1]).toMatchObject({ source: 'account' })
  })

  it('refuses anything else, and anyone not signed in', async () => {
    expect((await post({ answer: 'maybe' })).status).toBe(400)
    expect((await post({})).status).toBe(400)
    signedIn = false
    expect((await post({ answer: 'accept' })).status).toBe(401)
    expect(calls).toHaveLength(0)
  })
})
