import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  buildCapiPayload,
  buildUserData,
  hashEmail,
  normalizePhone,
  sha256,
} from '@/lib/marketing/destinations/meta-capi-payload'
import { CAPI_RELAY_EVENTS, toMetaCustomData } from '@/lib/marketing/destinations/meta-shared'
import { getMetaCapiConfig, getMetaPixelId } from '@/lib/marketing/meta-config'
import { buildEvent, purchaseEventId, type MarketingEvent } from '@/lib/marketing/events'
import { buildPurchaseEvent } from '@/lib/marketing/purchase'
import { createDispatcher } from '@/lib/marketing/dispatcher'
import { metaCapiDestination } from '@/lib/marketing/destinations/meta-capi'

const purchase = (over: Partial<MarketingEvent> = {}): MarketingEvent => ({
  eventId: purchaseEventId('ZUU-1'),
  eventName: 'purchase',
  timestamp: 1_760_000_000_000,
  source: 'server',
  consent: 'all',
  orderId: 'ZUU-1',
  currency: 'TRY',
  value: 449.99,
  items: [
    { productId: 'p1', productName: 'Vazo', quantity: 2, price: 150 },
    { productId: 'p2', productName: 'Kupa', quantity: 1, price: 99.99 },
  ],
  ...over,
})

describe('Meta user data: normalised then hashed', () => {
  it('hashes a lowercased, trimmed email', () => {
    expect(hashEmail('  Ali@Example.COM ')).toBe(sha256('ali@example.com'))
    expect(hashEmail('not-an-email')).toBeUndefined()
  })

  it.each([
    ['0 533 425 14 95', '905334251495'],
    ['533 425 14 95', '905334251495'],
    ['+90 533 425 14 95', '905334251495'],
    ['0090 533 425 14 95', '905334251495'],
  ])('phone %s → %s', (input, out) => {
    expect(normalizePhone(input)).toBe(out)
  })

  it('sends only hashed identity plus the raw technical ids', () => {
    const data = buildUserData(
      purchase({
        userId: 'u1',
        anonymousId: 'anon-1',
        user: { email: 'a@b.co', phone: '05334251495', firstName: 'Ayşe', lastName: 'Yılmaz', city: 'Bolu', postalCode: '14100' },
        client: { ip: '1.2.3.4', userAgent: 'UA', fbp: 'fb.1.1760000000000.123', fbc: 'fb.1.1760000000000.abc' },
      })
    )
    expect(data.em).toEqual([sha256('a@b.co')])
    expect(data.ph).toEqual([sha256('905334251495')])
    expect(data.fn).toEqual([sha256('ayşe')])
    expect(data.external_id).toEqual([sha256('u1'), sha256('anon-1')])
    expect(data.client_ip_address).toBe('1.2.3.4')
    expect(data.fbp).toBe('fb.1.1760000000000.123')
    expect(JSON.stringify(data)).not.toContain('a@b.co')
    expect(JSON.stringify(data)).not.toContain('05334251495')
  })

  it('builds fbc from the click id when the cookie is missing', () => {
    const body = buildCapiPayload(purchase({ fbclid: 'IwAR123' }))!
    expect(body.data[0].user_data.fbc).toBe('fb.1.1760000000000.IwAR123')
  })
})

describe('Meta CAPI payload', () => {
  it('maps a purchase: same event id as the browser, seconds, order values', () => {
    const body = buildCapiPayload(purchase())!
    const e = body.data[0]
    expect(e.event_name).toBe('Purchase')
    expect(e.event_id).toBe('purchase_ZUU-1')
    expect(e.event_time).toBe(1_760_000_000)
    expect(e.action_source).toBe('website')
    expect(e.custom_data).toMatchObject({
      value: 449.99,
      currency: 'TRY',
      num_items: 3,
      order_id: 'ZUU-1',
      content_ids: ['p1', 'p2'],
      contents: [
        { id: 'p1', quantity: 2, item_price: 150 },
        { id: 'p2', quantity: 1, item_price: 99.99 },
      ],
    })
  })

  it('adds the test event code only when given', () => {
    expect(buildCapiPayload(purchase())).not.toHaveProperty('test_event_code')
    expect(buildCapiPayload(purchase(), { testEventCode: 'TEST1' })).toMatchObject({ test_event_code: 'TEST1' })
  })

  it('drops events Meta has no equivalent for or that lack their data', () => {
    expect(buildCapiPayload(buildEvent('login', {}, { source: 'server' }))).toBeNull()
    expect(buildCapiPayload(buildEvent('newsletter_signup', {}, { source: 'server' }))).toBeNull()
    expect(buildCapiPayload(purchase({ items: undefined }))).toBeNull()
  })

  it('a purchase built from an order has the same id and value in the browser and server copies', () => {
    const built = buildPurchaseEvent({
      id: 'o1',
      orderNumber: 'ZUU-9',
      userId: 'u1',
      status: 'CONFIRMED',
      channel: 'DIRECT',
      paymentMethod: 'CARD',
      totalAmount: 300,
      shippingAmount: 0,
      couponCode: null,
      createdAt: '2026-10-05T10:00:00.000Z',
      items: [{ productId: 'p1', variantId: null, variantInfo: null, productName: 'Vazo', sku: 'V', quantity: 2, unitPrice: 150 }],
    })!
    const server = buildCapiPayload({ ...built, source: 'server', consent: 'all' })!
    expect(server.data[0].event_id).toBe(built.eventId)
    expect(server.data[0].custom_data.value).toBe(300)
  })
})

describe('Meta parameters', () => {
  it('ViewContent / AddToCart carry the single product', () => {
    const e = buildEvent('add_to_cart', { productId: 'p1', productName: 'Vazo', quantity: 2, price: 150, currency: 'TRY' }, { source: 'browser' })
    expect(toMetaCustomData(e)).toMatchObject({ content_ids: ['p1'], content_name: 'Vazo', value: 300, num_items: 2 })
  })

  it('relays only the events CAPI needs, never purchase', () => {
    expect([...CAPI_RELAY_EVENTS].sort()).toEqual(['add_payment_info', 'add_to_cart', 'begin_checkout', 'product_view', 'signup'])
    expect(CAPI_RELAY_EVENTS.has('purchase')).toBe(false)
  })
})

describe('Meta configuration', () => {
  const saved = { ...process.env }
  beforeEach(() => {
    delete process.env.META_PIXEL_ID
    delete process.env.META_CAPI_ACCESS_TOKEN
    delete process.env.META_CAPI_TEST_EVENT_CODE
  })
  afterEach(() => {
    process.env = { ...saved }
    vi.restoreAllMocks()
  })

  it('needs both the pixel id and the token', () => {
    expect(getMetaCapiConfig()).toBeNull()
    process.env.META_PIXEL_ID = '123456789012345'
    expect(getMetaCapiConfig()).toBeNull()
    process.env.META_CAPI_ACCESS_TOKEN = 'tok'
    expect(getMetaCapiConfig()).toMatchObject({ pixelId: '123456789012345', accessToken: 'tok' })
  })

  it('tolerates quotes and spaces in .env values, and rejects a non-numeric id', () => {
    process.env.META_PIXEL_ID = ' "123456789012345" '
    process.env.META_CAPI_TEST_EVENT_CODE = ' "TEST1" '
    process.env.META_CAPI_ACCESS_TOKEN = 'tok'
    expect(getMetaPixelId()).toBe('123456789012345')
    expect(getMetaCapiConfig()?.testEventCode).toBe('TEST1')
    process.env.META_PIXEL_ID = 'abc'
    expect(getMetaPixelId()).toBe('')
  })

  it('CAPI posts to the Graph API once configured, honours consent, and never throws', async () => {
    process.env.META_PIXEL_ID = '123456789012345'
    process.env.META_CAPI_ACCESS_TOKEN = 'secret-token'
    process.env.META_CAPI_TEST_EVENT_CODE = 'TEST1'
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)
    const dispatcher = createDispatcher({ destinations: [metaCapiDestination], onError: () => {} })

    await dispatcher.dispatch(purchase({ eventId: 'purchase_A', consent: 'necessary' }))
    await dispatcher.dispatch(purchase({ eventId: 'purchase_B', consent: null }))
    expect(fetchMock).not.toHaveBeenCalled()

    await dispatcher.dispatch(purchase({ eventId: 'purchase_C' }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/123456789012345/events')
    const sent = JSON.parse(init.body)
    expect(sent.test_event_code).toBe('TEST1')
    expect(sent.data[0].event_id).toBe('purchase_C')

    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: { message: 'bad', code: 100 } }) })
    await expect(dispatcher.dispatch(purchase({ eventId: 'purchase_D' }))).resolves.toBeUndefined()
    vi.unstubAllGlobals()
  })
})
