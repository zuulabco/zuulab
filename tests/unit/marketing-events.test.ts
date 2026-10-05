import { describe, expect, it, vi } from 'vitest'
import {
  buildEvent,
  CANONICAL_EVENTS,
  missingFields,
  newEventId,
  purchaseEventId,
  sumItems,
  type MarketingEvent,
  type MarketingItem,
} from '@/lib/marketing/events'
import { EVENT_MAPPING, ga4EventName, metaBrowserEventName, metaCapiEventName } from '@/lib/marketing/mapping'
import { consentAllows, createDispatcher, type Destination } from '@/lib/marketing/dispatcher'
import { ga4BrowserDestination, toGa4Params } from '@/lib/marketing/destinations/ga4-browser'
import { parseAttribution } from '@/lib/marketing/attribution'

const items: MarketingItem[] = [
  { productId: 'p1', variantId: 'v1', productName: 'Vazo', sku: 'VZ-1', quantity: 2, price: 150 },
  { productId: 'p2', productName: 'Kupa', sku: 'KP-1', quantity: 1, price: 99.99 },
]

const ctx = { source: 'browser' as const, consent: 'all' as const, now: () => 1_700_000_000_000 }

function spy(over: Partial<Destination> = {}): Destination & { sent: MarketingEvent[] } {
  const sent: MarketingEvent[] = []
  return {
    id: 'spy',
    consent: 'analytics',
    accepts: () => true,
    send: (e) => {
      sent.push(e)
    },
    sent,
    ...over,
  }
}

describe('event ids', () => {
  it('are unique per action', () => {
    expect(newEventId()).not.toBe(newEventId())
    expect(newEventId().length).toBeGreaterThan(8)
  })

  it('are deterministic for a purchase, so every copy of an order shares one id', () => {
    expect(purchaseEventId('ZUU-20260001')).toBe('purchase_ZUU-20260001')
    expect(purchaseEventId('ZUU-20260001')).toBe(purchaseEventId('ZUU-20260001'))
    expect(purchaseEventId('ZUU-20260002')).not.toBe(purchaseEventId('ZUU-20260001'))
  })

  it('keep a caller supplied id (browser/server pairing)', () => {
    const e = buildEvent('add_payment_info', { eventId: 'custom-1', items, value: 1, paymentMethod: 'CARD' }, ctx)
    expect(e.eventId).toBe('custom-1')
  })
})

describe('buildEvent', () => {
  it('builds an anonymous page_view with no user', () => {
    const e = buildEvent('page_view', { pageUrl: 'https://zuulab.co/', anonymousId: 'a-1', sessionId: 's-1' }, ctx)
    expect(e).toMatchObject({ eventName: 'page_view', timestamp: 1_700_000_000_000, source: 'browser', anonymousId: 'a-1', sessionId: 's-1' })
    expect(e.userId).toBeUndefined()
    expect(e.eventId).toBeTruthy()
    expect(missingFields(e)).toEqual([])
  })

  it('carries the user id for an authenticated visitor, and explicit data wins over context', () => {
    const e = buildEvent('login', { userId: 'u-explicit', method: 'email' }, { ...ctx, base: { userId: 'u-context', anonymousId: 'a-1' } })
    expect(e.userId).toBe('u-explicit')
    expect(e.anonymousId).toBe('a-1')
    const fromContext = buildEvent('product_view', { productId: 'p', productName: 'n', price: 1, currency: 'TRY' }, { ...ctx, base: { userId: 'u-context' } })
    expect(fromContext.userId).toBe('u-context')
  })

  it('drops undefined values', () => {
    const e = buildEvent('search', { searchTerm: 'vazo', userId: undefined }, ctx)
    expect('userId' in e).toBe(false)
  })
})

describe('required fields per event', () => {
  const ok: Record<string, Partial<MarketingEvent>> = {
    page_view: { pageUrl: 'https://zuulab.co/' },
    product_view: { productId: 'p1', productName: 'Vazo', price: 150, currency: 'TRY' },
    search: { searchTerm: 'vazo' },
    add_to_cart: { productId: 'p1', productName: 'Vazo', quantity: 1, price: 150, currency: 'TRY' },
    begin_checkout: { items, value: 399.99, currency: 'TRY' },
    purchase: { orderId: 'ZUU-1', items, value: 399.99, currency: 'TRY' },
  }

  it.each(Object.keys(ok))('%s is valid with its own fields', (name) => {
    const e = buildEvent(name as never, ok[name] as never, ctx)
    expect(missingFields(e)).toEqual([])
  })

  it('rejects a purchase without an order id or items', () => {
    expect(missingFields(buildEvent('purchase', { items, value: 1, currency: 'TRY' }, ctx))).toEqual(['orderId'])
    expect(missingFields(buildEvent('purchase', { orderId: 'X', items: [], value: 1, currency: 'TRY' }, ctx))).toEqual(['items'])
  })

  it('does not require unrelated fields (no price on a page_view)', () => {
    expect(missingFields(buildEvent('page_view', { pageUrl: '/x' }, ctx))).toEqual([])
  })
})

describe('event mapping', () => {
  const table: Array<[string, string, string, string]> = [
    ['page_view', 'page_view', 'PageView', 'PageView'],
    ['product_view', 'view_item', 'ViewContent', 'ViewContent'],
    ['search', 'search', 'Search', 'Search'],
    ['add_to_cart', 'add_to_cart', 'AddToCart', 'AddToCart'],
    ['begin_checkout', 'begin_checkout', 'InitiateCheckout', 'InitiateCheckout'],
    ['add_payment_info', 'add_payment_info', 'AddPaymentInfo', 'AddPaymentInfo'],
    ['purchase', 'purchase', 'Purchase', 'Purchase'],
    ['signup', 'sign_up', 'CompleteRegistration', 'CompleteRegistration'],
  ]

  it.each(table)('%s maps to GA4 %s, Meta Pixel %s, Meta CAPI %s', (name, ga4, pixel, capi) => {
    expect(ga4EventName(name as never)).toBe(ga4)
    expect(metaBrowserEventName(name as never)).toBe(pixel)
    expect(metaCapiEventName(name as never)).toBe(capi)
  })

  it('covers every canonical event, and canonical names are not destination names', () => {
    expect(Object.keys(EVENT_MAPPING).sort()).toEqual([...CANONICAL_EVENTS].sort())
    for (const name of CANONICAL_EVENTS) expect(name).toBe(name.toLowerCase())
  })

  it('keeps the bülten signup on GA4 sign_up so the admin report is unchanged', () => {
    expect(ga4EventName('newsletter_signup')).toBe('sign_up')
  })
})

describe('GA4 browser adapter', () => {
  it('turns a single product event into GA4 items using the sku as item_id', () => {
    const e = buildEvent('add_to_cart', { productId: 'p1', productName: 'Vazo', sku: 'VZ-1', variantLabel: 'Siyah', quantity: 2, price: 150, currency: 'TRY' }, ctx)
    expect(toGa4Params(e)).toEqual({
      currency: 'TRY',
      value: 300,
      items: [{ item_id: 'VZ-1', item_name: 'Vazo', price: 150, quantity: 2, item_brand: 'zuulab', item_variant: 'Siyah', index: 0 }],
    })
  })

  it('sends a purchase with transaction id and revenue excluding shipping', () => {
    const e = buildEvent('purchase', { orderId: 'ZUU-1', items, value: 449.99, shipping: 50, currency: 'TRY', coupon: 'YAZ' }, ctx)
    const params = toGa4Params(e)!
    expect(params.transaction_id).toBe('ZUU-1')
    expect(params.value).toBe(399.99)
    expect(params.shipping).toBe(50)
    expect(params.coupon).toBe('YAZ')
    expect((params.items as unknown[]).length).toBe(2)
  })

  it('leaves page_view to GA4 enhanced measurement', () => {
    expect(ga4BrowserDestination.accepts(buildEvent('page_view', { pageUrl: '/' }, ctx))).toBe(false)
  })

  it('sends the newsletter signup as sign_up with its method', () => {
    expect(toGa4Params(buildEvent('newsletter_signup', { method: 'bülten' }, ctx))).toEqual({ method: 'bülten' })
  })
})

describe('dispatcher', () => {
  const purchase = () => buildEvent('purchase', { eventId: newEventId(), orderId: 'ZUU-1', items, value: 399.99, currency: 'TRY' }, ctx)

  it('delivers to every accepting destination', async () => {
    const a = spy({ id: 'a' })
    const b = spy({ id: 'b' })
    await createDispatcher({ destinations: [a, b] }).dispatch(purchase())
    expect(a.sent).toHaveLength(1)
    expect(b.sent).toHaveLength(1)
  })

  it('never throws or rejects when a destination throws or rejects, and other destinations still run', async () => {
    const onError = vi.fn()
    const good = spy({ id: 'good' })
    const throws = spy({ id: 'throws', send: () => { throw new Error('boom') } })
    const rejects = spy({ id: 'rejects', send: () => Promise.reject(new Error('nope')) })
    const d = createDispatcher({ destinations: [throws, rejects, good], onError })
    await expect(d.dispatch(purchase())).resolves.toBeUndefined()
    expect(good.sent).toHaveLength(1)
    expect(onError).toHaveBeenCalledTimes(2)
  })

  it('survives a throwing error handler', async () => {
    const throws = spy({ send: () => { throw new Error('boom') } })
    const d = createDispatcher({ destinations: [throws], onError: () => { throw new Error('handler') } })
    await expect(d.dispatch(purchase())).resolves.toBeUndefined()
  })

  it('does not wait on a destination that hangs (timeout)', async () => {
    const hangs = spy({ send: () => new Promise<void>(() => {}) })
    const started = Date.now()
    await createDispatcher({ destinations: [hangs], timeoutMs: 40 }).dispatch(purchase())
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it('drops an invalid event instead of sending it', async () => {
    const a = spy()
    const bad = buildEvent('purchase', { items, value: 1, currency: 'TRY' }, ctx) // no orderId
    await createDispatcher({ destinations: [a] }).dispatch(bad)
    expect(a.sent).toHaveLength(0)
  })

  it('filters a repeated event id (same purchase sent twice reaches a destination once)', async () => {
    const a = spy()
    const d = createDispatcher({ destinations: [a] })
    const e = buildEvent('purchase', { eventId: purchaseEventId('ZUU-9'), orderId: 'ZUU-9', items, value: 1, currency: 'TRY' }, ctx)
    await d.dispatch(e)
    await d.dispatch({ ...e })
    expect(a.sent).toHaveLength(1)
  })

  it('applies consent per destination', async () => {
    const analytics = spy({ id: 'analytics', consent: 'analytics' })
    const operational = spy({ id: 'operational', consent: 'none' })
    const d = createDispatcher({ destinations: [analytics, operational] })
    await d.dispatch(buildEvent('search', { searchTerm: 'a' }, { ...ctx, consent: 'necessary' }))
    await d.dispatch(buildEvent('search', { searchTerm: 'b' }, { ...ctx, consent: null }))
    expect(analytics.sent).toHaveLength(0)
    expect(operational.sent).toHaveLength(2)
    await d.dispatch(buildEvent('search', { searchTerm: 'c' }, { ...ctx, consent: 'all' }))
    expect(analytics.sent).toHaveLength(1)
  })

  it('consentAllows treats unknown consent (a server event) as not granted', () => {
    expect(consentAllows('marketing', null)).toBe(false)
    expect(consentAllows('marketing', undefined)).toBe(false)
    expect(consentAllows('marketing', 'necessary')).toBe(false)
    expect(consentAllows('marketing', 'all')).toBe(true)
    expect(consentAllows('none', null)).toBe(true)
  })
})

describe('attribution', () => {
  it('reads UTM parameters and ad click ids from a landing URL', () => {
    expect(parseAttribution('?utm_source=facebook&utm_medium=paid&utm_campaign=yaz&utm_term=adset1&utm_content=ad7&fbclid=abc')).toEqual({
      utmSource: 'facebook',
      utmMedium: 'paid',
      utmCampaign: 'yaz',
      utmTerm: 'adset1',
      utmContent: 'ad7',
      fbclid: 'abc',
    })
  })

  it('returns null for an organic visit and trims oversized values', () => {
    expect(parseAttribution('?q=vazo&page=2')).toBeNull()
    expect(parseAttribution(`?utm_source=${'x'.repeat(500)}`)!.utmSource).toHaveLength(200)
  })
})

describe('sumItems', () => {
  it('adds line totals to two decimals', () => {
    expect(sumItems(items)).toBe(399.99)
  })
})
