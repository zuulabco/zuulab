import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUTOMATIONS, abandonedPaymentMail, automationDef, crossSellMail, inQuietHours, reviewRequestMail, signOptout, turkeyHour, verifyOptout, winBackMail, withMailTags,
} from '@/lib/email/automations'
import { campaignContentSchema, renderCampaignBody } from '@/lib/email/campaign'

describe('which automations exist', () => {
  it('has the agreed rules, all only for people who gave the e-mail permission (not the newsletter)', () => {
    expect(AUTOMATIONS.map((a) => a.key)).toEqual(['abandoned_payment', 'review_request', 'win_back', 'cross_sell'])
    for (const a of AUTOMATIONS) {
      expect(a.audience).toContain('e-posta izni')
      expect(a.audience.toLowerCase()).not.toContain('bültene abone olanlar veya')
    }
    expect(automationDef('nope')).toBeUndefined()
  })
})

describe('quiet hours (Türkiye time, UTC+3)', () => {
  const at = (iso: string) => new Date(`${iso}:00Z`)

  it.each([
    ['2026-10-05T05:59', 8, true], // 08:59 TR
    ['2026-10-05T06:00', 9, false], // 09:00 TR: the daily Vercel run
    ['2026-10-05T12:00', 15, false],
    ['2026-10-05T17:59', 20, false], // 20:59 TR
    ['2026-10-05T18:00', 21, true], // 21:00 TR
    ['2026-10-05T21:30', 0, true], // 00:30 TR
    ['2026-10-05T03:00', 6, true],
  ])('%s UTC is %i:xx in Türkiye, quiet = %s', (iso, hour, quiet) => {
    expect(turkeyHour(at(iso))).toBe(hour)
    expect(inQuietHours(at(iso))).toBe(quiet)
  })
})

describe('mail content', () => {
  const items = [
    { name: 'Zuulight Muse', quantity: 1 },
    { name: 'Mini Dinozor', quantity: 3 },
  ]

  it('the unpaid-order reminder lists the products and links to the cart', () => {
    const m = abandonedPaymentMail(items, 'https://www.zuulab.com')
    expect(m.subject).toBe('sepetindeki ürünler seni bekliyor')
    expect(m.content.paragraphs.join('\n')).toContain('• Zuulight Muse\n• Mini Dinozor × 3')
    expect(m.content.ctaUrl).toBe('https://www.zuulab.com/sepet')
    expect(campaignContentSchema.safeParse(m.content).success).toBe(true)
  })

  it('makes no promise it cannot keep: no discount, no fake deadline', () => {
    const text = JSON.stringify(abandonedPaymentMail(items, 'https://x.com').content).toLowerCase()
    expect(text).not.toMatch(/indirim|kupon|%|son \d+ (saat|dakika)|tükeniyor/)
  })

  it('the review request has no promotion and points to the product reviews', () => {
    const m = reviewRequestMail([{ ...items[0], path: '/urun/zuulight-muse' }, { ...items[1], path: '/urun/mini-dinozor' }], 'https://www.zuulab.com')
    expect(m.content.ctaUrl).toBe('https://www.zuulab.com/urun/zuulight-muse#reviews')
    expect(JSON.stringify(m.content).toLowerCase()).not.toMatch(/indirim|kupon|kampanya/)
    expect(campaignContentSchema.safeParse(m.content).success).toBe(true)
  })

  it('long orders are cut, and product names are escaped like everything else', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ name: `Ürün ${i + 1}`, quantity: 1 }))
    expect(abandonedPaymentMail(many, 'https://x.com').content.paragraphs[1]).toContain('… ve 3 ürün daha')
    const html = renderCampaignBody(abandonedPaymentMail([{ name: '<script>alert(1)</script>', quantity: 1 }], 'https://x.com').content)
    expect(html).not.toContain('<script')
  })
})

describe('the "I do not want these" link', () => {
  const SECRET = 'test-signing-secret'

  it('only a link we signed names an address', () => {
    const { e, s } = signOptout(SECRET, '  Ali@Example.COM ')
    expect(verifyOptout(SECRET, e, s)).toBe('ali@example.com')
  })

  it.each([
    ['a forged signature', (l: { e: string; s: string }) => [l.e, 'x'.repeat(l.s.length)]],
    ['another address with this signature', (l: { e: string; s: string }) => [Buffer.from('victim@example.com').toString('base64url'), l.s]],
    ['a missing signature', (l: { e: string; s: string }) => [l.e, '']],
    ['an address that is not one', () => [Buffer.from('no-at-sign').toString('base64url'), signOptout(SECRET, 'no-at-sign').s]],
  ])('refuses %s', (_name, make) => {
    const [e, s] = make(signOptout(SECRET, 'ali@example.com'))
    expect(verifyOptout(SECRET, e, s)).toBeNull()
  })

  it('refuses a link signed with another secret, and refuses everything when there is no secret', () => {
    const { e, s } = signOptout('other-secret', 'ali@example.com')
    expect(verifyOptout(SECRET, e, s)).toBeNull()
    expect(verifyOptout('', e, s)).toBeNull()
  })
})

// ── the opt-out endpoint ─────────────────────────────────────────────

const recorded: string[] = []
vi.mock('@/lib/security/rate-limit-response', () => ({ rateLimit: async () => null }))
vi.mock('@/lib/services/session.service', () => ({ getSigningSecret: () => 'test-signing-secret' }))
vi.mock('@/lib/services/email-consent.service', () => ({ withdrawEmailConsent: async (email: string) => (recorded.push(email), true) }))

const post = async (qs: string, body?: unknown) => {
  const { POST } = await import('@/app/api/email/optout/route')
  return POST(new Request(`https://zuulab.com/api/email/optout${qs}`, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }))
}

describe('POST /api/email/optout (takes the e-mail permission back)', () => {
  beforeEach(() => void (recorded.length = 0))
  const link = signOptout('test-signing-secret', 'ali@example.com')

  it('records the address from a signed link, as a mail app posts it (query string) or as the page does (body)', async () => {
    expect((await post(`?e=${link.e}&s=${link.s}`)).status).toBe(200)
    expect((await post('', link)).status).toBe(200)
    expect(recorded).toEqual(['ali@example.com', 'ali@example.com'])
  })

  it('records nothing for a forged or empty request', async () => {
    expect((await post(`?e=${link.e}&s=forged`)).status).toBe(400)
    expect((await post('')).status).toBe(400)
    expect(recorded).toEqual([])
  })
})

describe('win-back and cross-sell mails', () => {
  const recs = [
    { name: 'Mini Dinozor', path: '/urun/mini-dinozor', price: 249.9 },
    { name: 'Spinner Ball', path: '/urun/spinner-ball', price: 99 },
  ]

  it('list the suggestions with their prices and stay valid campaign content', () => {
    const win = winBackMail(recs, 'https://zuulab.com')
    expect(win.content.paragraphs.join('\n')).toContain('Mini Dinozor — 249,90 ₺')
    expect(campaignContentSchema.safeParse(win.content).success).toBe(true)
    const cross = crossSellMail([{ name: 'Renk Sıralama', quantity: 1 }], recs, 'https://zuulab.com')
    expect(cross.content.paragraphs[0]).toContain('Renk Sıralama')
    expect(cross.content.ctaUrl).toContain('/urun/mini-dinozor')
    expect(campaignContentSchema.safeParse(cross.content).success).toBe(true)
  })

  it('carry no discount promise and tag their links so the shop can tell which mail brought a visit', () => {
    const body = JSON.stringify(winBackMail(recs, 'https://zuulab.com')).toLowerCase()
    expect(body).not.toMatch(/indirim|%\d|kupon/)
    expect(winBackMail(recs, 'https://zuulab.com').content.ctaUrl).toBe('https://zuulab.com/urunler?utm_source=email&utm_medium=automation&utm_campaign=win_back')
    expect(withMailTags('https://zuulab.com/urun/x?a=1', 'cross_sell')).toBe('https://zuulab.com/urun/x?a=1&utm_source=email&utm_medium=automation&utm_campaign=cross_sell')
  })

  it('cross-sell sends no button when there is nothing to suggest', () => {
    expect(crossSellMail([], [], 'https://zuulab.com').content.ctaUrl).toBeUndefined()
  })
})
