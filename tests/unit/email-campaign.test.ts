import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  campaignInputSchema, campaignRates, escapeHtml, messageEventOf, renderCampaignBody, sumCounts, verifySvixSignature,
  type MessageCounts,
} from '@/lib/email/campaign'

const valid = {
  name: 'Yaz kampanyası',
  subject: 'Yeni ürünler geldi',
  content: { heading: 'Merhaba', paragraphs: ['İlk paragraf.', '', 'İkinci paragraf.\nYeni satır.'], ctaLabel: 'Ürünlere bak', ctaUrl: 'https://www.zuulab.com/urunler' },
}

describe('campaign content', () => {
  it('accepts a normal campaign and drops empty paragraphs', () => {
    const r = campaignInputSchema.safeParse(valid)
    expect(r.success).toBe(true)
    expect(r.success && r.data.content.paragraphs).toEqual(['İlk paragraf.', 'İkinci paragraf.\nYeni satır.'])
  })

  it.each([
    ['no name', { ...valid, name: ' ' }],
    ['no subject', { ...valid, subject: '' }],
    ['no heading', { ...valid, content: { ...valid.content, heading: '' } }],
    ['no paragraph', { ...valid, content: { ...valid.content, paragraphs: ['  ', ''] } }],
    ['a button without a link', { ...valid, content: { ...valid.content, ctaUrl: '' } }],
    ['a link without button text', { ...valid, content: { ...valid.content, ctaLabel: '' } }],
    ['a non-https link', { ...valid, content: { ...valid.content, ctaUrl: 'http://zuulab.com' } }],
    ['a javascript link', { ...valid, content: { ...valid.content, ctaUrl: 'javascript:alert(1)' } }],
    ['a too long subject', { ...valid, subject: 'x'.repeat(151) }],
  ])('refuses %s', (_name, input) => {
    expect(campaignInputSchema.safeParse(input).success).toBe(false)
  })

  it('a button is optional', () => {
    const { ctaLabel: _l, ctaUrl: _u, ...content } = valid.content
    expect(campaignInputSchema.safeParse({ ...valid, content }).success).toBe(true)
  })
})

describe('campaign HTML', () => {
  it('escapes everything the admin typed, so a campaign cannot carry markup or script', () => {
    const html = renderCampaignBody({
      heading: '<img src=x onerror=alert(1)>',
      paragraphs: ['<script>alert("x")</script> & "quotes"'],
      ctaLabel: '"><b>click</b>',
      ctaUrl: 'https://zuulab.com/?a=1&b="2"',
    })
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<b>click')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp; &quot;quotes&quot;')
    expect(html).toContain('href="https://zuulab.com/?a=1&amp;b=&quot;2&quot;"')
  })

  it('keeps line breaks, and renders the button only when there is one', () => {
    const withButton = renderCampaignBody(valid.content as never)
    expect(withButton).toContain('İkinci paragraf.<br>Yeni satır.')
    expect(withButton).toContain('class="btn"')
    expect(renderCampaignBody({ heading: 'H', paragraphs: ['p'] })).not.toContain('class="btn"')
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;')
  })
})

// ── webhook signature ────────────────────────────────────────────────

const secretBytes = Buffer.from('a-very-secret-signing-key-of-bytes')
const SECRET = `whsec_${secretBytes.toString('base64')}`
const sign = (id: string, ts: string, body: string, key = secretBytes) => `v1,${createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64')}`
const NOW = 1_760_000_000_000
const ts = String(NOW / 1000)
const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 'abc' } })

describe('Resend webhook signature', () => {
  it('accepts a correctly signed delivery', () => {
    expect(verifySvixSignature(SECRET, { id: 'msg_1', timestamp: ts, signature: sign('msg_1', ts, body) }, body, NOW)).toBe(true)
  })

  it('accepts when one of several signatures matches (key rotation)', () => {
    const sig = `v1,${Buffer.from('nope').toString('base64')} ${sign('msg_1', ts, body)}`
    expect(verifySvixSignature(SECRET, { id: 'msg_1', timestamp: ts, signature: sig }, body, NOW)).toBe(true)
  })

  it.each([
    ['a tampered body', () => verifySvixSignature(SECRET, { id: 'msg_1', timestamp: ts, signature: sign('msg_1', ts, body) }, body + ' ', NOW)],
    ['another delivery id', () => verifySvixSignature(SECRET, { id: 'msg_2', timestamp: ts, signature: sign('msg_1', ts, body) }, body, NOW)],
    ['the wrong secret', () => verifySvixSignature(SECRET, { id: 'msg_1', timestamp: ts, signature: sign('msg_1', ts, body, Buffer.from('other')) }, body, NOW)],
    ['a replay older than five minutes', () => verifySvixSignature(SECRET, { id: 'msg_1', timestamp: ts, signature: sign('msg_1', ts, body) }, body, NOW + 6 * 60_000)],
    ['a timestamp from the future', () => verifySvixSignature(SECRET, { id: 'msg_1', timestamp: ts, signature: sign('msg_1', ts, body) }, body, NOW - 6 * 60_000)],
    ['missing headers', () => verifySvixSignature(SECRET, { id: null, timestamp: ts, signature: sign('msg_1', ts, body) }, body, NOW)],
    ['no secret configured', () => verifySvixSignature('', { id: 'msg_1', timestamp: ts, signature: sign('msg_1', ts, body) }, body, NOW)],
    ['a non-v1 signature', () => verifySvixSignature(SECRET, { id: 'msg_1', timestamp: ts, signature: sign('msg_1', ts, body).replace('v1,', 'v2,') }, body, NOW)],
  ])('refuses %s', (_name, check) => {
    expect(check()).toBe(false)
  })
})

describe('events and rates', () => {
  it('maps Resend events and ignores the ones we do not use', () => {
    expect(messageEventOf('email.opened')).toBe('opened')
    expect(messageEventOf('email.bounced')).toBe('bounced')
    expect(messageEventOf('email.delivery_delayed')).toBe('delayed')
    expect(messageEventOf('contact.created')).toBeNull()
    expect(messageEventOf(undefined)).toBeNull()
  })

  const counts = (over: Partial<MessageCounts> = {}): MessageCounts => ({ sent: 100, delivered: 96, opened: 48, clicked: 12, bounced: 4, complained: 0, unsubscribed: 2, failed: 0, ...over })

  it('opens and clicks are shares of what reached the inbox', () => {
    const r = campaignRates(counts())
    expect(r.deliveryRate).toBeCloseTo(0.96)
    expect(r.openRate).toBeCloseTo(0.5)
    expect(r.clickRate).toBeCloseTo(0.125)
    expect(r.bounceRate).toBeCloseTo(0.04)
    expect(r.unsubscribeRate).toBeCloseTo(2 / 96)
  })

  it('an open that arrives before its delivery event still counts as delivered', () => {
    const r = campaignRates(counts({ delivered: 0, opened: 10, clicked: 0, sent: 20 }))
    expect(r.deliveryRate).toBeCloseTo(0.5)
    expect(r.openRate).toBe(1)
  })

  it('nothing sent gives no rates, not 0 %', () => {
    const r = campaignRates(counts({ sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0 }))
    expect(Object.values(r).every((v) => v === null)).toBe(true)
  })

  it('sums campaigns', () => {
    expect(sumCounts([counts(), counts({ sent: 10, delivered: 10, opened: 5, clicked: 1, bounced: 0, unsubscribed: 0 })]).sent).toBe(110)
    expect(sumCounts([]).sent).toBe(0)
  })
})

// ── the webhook endpoint ─────────────────────────────────────────────

const applied: Array<[string, unknown]> = []
let outcome: 'applied' | 'duplicate' | 'ignored' | 'retry' = 'applied'
vi.mock('@/lib/services/email-campaign.service', () => ({
  applyResendEvent: async (id: string, payload: unknown) => (applied.push([id, payload]), outcome),
}))

const post = async (headers: Record<string, string>, rawBody = body) => {
  const { POST } = await import('@/app/api/webhooks/resend/route')
  return POST(new Request('https://zuulab.com/api/webhooks/resend', { method: 'POST', headers, body: rawBody }))
}
const signed = (id = 'msg_1') => {
  const now = String(Math.floor(Date.now() / 1000))
  return { 'svix-id': id, 'svix-timestamp': now, 'svix-signature': sign(id, now, body) }
}

describe('POST /api/webhooks/resend', () => {
  beforeEach(() => {
    applied.length = 0
    outcome = 'applied'
    process.env.RESEND_WEBHOOK_SECRET = SECRET
  })

  it('refuses everything when no secret is configured', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET
    expect((await post(signed())).status).toBe(401)
    expect(applied).toHaveLength(0)
  })

  it('refuses a bad or missing signature and applies nothing', async () => {
    expect((await post({ ...signed(), 'svix-signature': 'v1,AAAA' })).status).toBe(401)
    expect((await post({})).status).toBe(401)
    expect(applied).toHaveLength(0)
  })

  it('applies a correctly signed event once, with the delivery id', async () => {
    const res = await post(signed('msg_77'))
    expect(res.status).toBe(200)
    expect(applied).toHaveLength(1)
    expect(applied[0][0]).toBe('msg_77')
  })

  it('asks Resend to retry when the mail is not recorded yet', async () => {
    outcome = 'retry'
    expect((await post(signed())).status).toBe(409)
  })
})
