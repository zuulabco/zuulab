import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  abandonmentRate, averageOrderValue, buildFunnel, eventRow, pagePathOf, periodBounds, share,
} from '@/lib/analytics/internal'
import { buildEvent, type MarketingEvent } from '@/lib/marketing/events'

const ev = (name: Parameters<typeof buildEvent>[0], data: Parameters<typeof buildEvent>[1] = {}): MarketingEvent =>
  buildEvent(name, { anonymousId: 'anon-1', sessionId: 'sess-1', ...data }, { source: 'browser', consent: 'all' })

describe('what is stored per event', () => {
  it('drops the query string of the page (it can carry personal data)', () => {
    expect(pagePathOf('https://www.zuulab.com/urun/x?email=a@b.co&utm_source=meta#top')).toBe('/urun/x')
    expect(pagePathOf(undefined)).toBeNull()
  })

  it('a product event keeps its product and value', () => {
    const row = eventRow(ev('add_to_cart', { productId: 'p1', productName: 'Vazo', quantity: 2, price: 150.555, pageUrl: 'https://zuulab.com/urun/vazo?x=1' }))!
    expect(row).toMatchObject({ name: 'add_to_cart', productId: 'p1', value: 301.11, pagePath: '/urun/vazo', anonymousId: 'anon-1', sessionId: 'sess-1' })
  })

  it('a one-item checkout names its product, a many-item one does not', () => {
    const one = eventRow(ev('begin_checkout', { items: [{ productId: 'p1', productName: 'a', quantity: 1, price: 10 }], value: 10 }))!
    const many = eventRow(ev('begin_checkout', { items: [{ productId: 'p1', productName: 'a', quantity: 1, price: 10 }, { productId: 'p2', productName: 'b', quantity: 1, price: 5 }], value: 15 }))!
    expect(one.productId).toBe('p1')
    expect(many.productId).toBeNull()
    expect(many.value).toBe(15)
  })

  it('never stores a purchase: sales come from orders', () => {
    expect(eventRow(ev('purchase', { orderId: 'ZUU-1', value: 100 }))).toBeNull()
  })

  it('keeps campaign fields and cuts long values', () => {
    const row = eventRow(ev('page_view', { pageUrl: 'https://zuulab.com/', utmSource: 'meta', utmMedium: 'paid_social', utmCampaign: 'x'.repeat(500) }))!
    expect(row.utmSource).toBe('meta')
    expect(row.utmCampaign).toHaveLength(200)
  })
})

describe('report periods', () => {
  it('a Turkish day starts at 21:00 UTC the day before', () => {
    expect(periodBounds({ start: '2026-10-05', end: '2026-10-05' })).toEqual({ from: '2026-10-04 21:00:00', to: '2026-10-05 21:00:00' })
    expect(periodBounds({ start: '2026-09-30', end: '2026-10-02' })).toEqual({ from: '2026-09-29 21:00:00', to: '2026-10-02 21:00:00' })
  })
})

describe('counts become honest rates', () => {
  it('a rate with nothing to divide by is null, never 0 %', () => {
    expect(share(0, 0)).toBeNull()
    expect(share(1, 4)).toBe(0.25)
    expect(averageOrderValue(0, 0)).toBeNull()
    expect(averageOrderValue(300, 4)).toBe(75)
  })

  it('funnel keeps the share of the first step and of the previous one', () => {
    const f = buildFunnel({ visitors: 100, productViewers: 60, cartAdders: 12, checkoutStarters: 6, paymentStarters: 4, buyers: 3 })
    expect(f.map((s) => s.visitors)).toEqual([100, 60, 12, 6, 4, 3])
    expect(f[2]).toMatchObject({ key: 'cartAdders', ofVisitors: 0.12, ofPrevious: 0.2 })
    expect(f[0].ofPrevious).toBeNull()
    expect(buildFunnel({ visitors: 0, productViewers: 0, cartAdders: 0, checkoutStarters: 0, paymentStarters: 0, buyers: 0 })[1].ofVisitors).toBeNull()
  })

  it('abandonment: those who reached a step and did not buy', () => {
    expect(abandonmentRate(10, 3)).toBeCloseTo(0.7)
    expect(abandonmentRate(0, 0)).toBeNull()
    expect(abandonmentRate(2, 5)).toBe(0) // never negative
  })
})

// ── the collect endpoint ─────────────────────────────────────────────

const stored: unknown[] = []
vi.mock('@/lib/security/rate-limit-response', () => ({ rateLimit: async () => null }))
vi.mock('@/lib/services/analytics/internal-analytics.service', () => ({ storeEvent: async (row: unknown) => void stored.push(row) }))

const post = async (body: unknown, cookie = 'zuulab_cookie_consent=all') => {
  const { POST } = await import('@/app/api/marketing/collect/route')
  return POST(new Request('https://zuulab.com/api/marketing/collect', { method: 'POST', headers: { cookie }, body: JSON.stringify(body) }))
}
const valid = { eventId: 'event-0001', eventName: 'add_to_cart', anonymousId: 'a1', productId: 'p1', quantity: 1, price: 10, pageUrl: 'https://zuulab.com/urun/x?q=1' }

describe('POST /api/marketing/collect', () => {
  beforeEach(() => { stored.length = 0 })

  it('stores an event from a consenting visitor, answering 204', async () => {
    expect((await post(valid)).status).toBe(204)
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ eventId: 'event-0001', name: 'add_to_cart', productId: 'p1', pagePath: '/urun/x' })
  })

  it('stores nothing without the consent cookie, or for "necessary"', async () => {
    expect((await post(valid, '')).status).toBe(204)
    expect((await post(valid, 'zuulab_cookie_consent=necessary')).status).toBe(204)
    expect(stored).toHaveLength(0)
  })

  it('refuses a purchase, unknown events and bad bodies quietly', async () => {
    await post({ ...valid, eventName: 'purchase', eventId: 'purchase_X1234' })
    await post({ ...valid, eventName: 'drop_table' })
    await post({ eventId: 'x' })
    await post('not an object')
    expect(stored).toHaveLength(0)
  })

  it('ignores a user id sent in the body', async () => {
    await post({ ...valid, userId: 'someone-else' })
    expect(JSON.stringify(stored[0])).not.toContain('someone-else')
  })
})
