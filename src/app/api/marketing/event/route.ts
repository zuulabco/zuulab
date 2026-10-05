import { NextResponse } from 'next/server'
import { z } from 'zod'
import { rateLimit } from '@/lib/security/rate-limit-response'
import { buildEvent, missingFields, type MarketingEventData } from '@/lib/marketing/events'
import { CAPI_RELAY_EVENTS } from '@/lib/marketing/destinations/meta-shared'
import { getMetaCapiConfig } from '@/lib/marketing/meta-config'
import { readClientContext, readConsentCookie } from '@/lib/marketing/request-context'
import { serverDispatcher } from '@/lib/marketing/server'

export const dynamic = 'force-dynamic'

/**
 * Receives browser events that Meta's Conversions API should also get (ViewContent,
 * AddToCart, InitiateCheckout, AddPaymentInfo, CompleteRegistration) and sends them with
 * the same eventId the Meta Pixel used, so Meta counts each action once.
 *
 * Trust: the visitor's consent is read from the consent cookie, not from the body; the IP,
 * user agent and Meta cookies are read from the request itself; only a fixed list of
 * fields is accepted. `purchase` is refused here: it is sent only from the stored order.
 * Whatever happens, the answer is 204 so tracking never shows up as a page error.
 */

const text = (max: number) => z.string().max(max)
const money = z.number().finite().min(0).max(10_000_000)

const itemSchema = z.object({
  productId: text(100),
  variantId: text(100).nullish(),
  productName: text(300),
  sku: text(100).optional(),
  category: text(200).optional(),
  variantLabel: text(200).nullish(),
  quantity: z.number().int().min(1).max(1000),
  price: money,
})

const bodySchema = z.object({
  eventId: z.string().min(8).max(100),
  eventName: z.string(),
  timestamp: z.number().finite().optional(),
  pageUrl: text(2000).optional(),
  anonymousId: text(64).optional(),
  productId: text(100).optional(),
  variantId: text(100).nullish(),
  productName: text(300).optional(),
  sku: text(100).optional(),
  category: text(200).optional(),
  variantLabel: text(200).nullish(),
  quantity: z.number().int().min(1).max(1000).optional(),
  price: money.optional(),
  currency: z.literal('TRY').optional(),
  value: money.optional(),
  items: z.array(itemSchema).max(100).optional(),
  method: text(50).optional(),
  paymentMethod: z.enum(['CARD', 'BANK_TRANSFER', 'CASH_ON_DELIVERY']).optional(),
  coupon: text(100).optional(),
  utmSource: text(200).optional(),
  utmMedium: text(200).optional(),
  utmCampaign: text(200).optional(),
  utmTerm: text(200).optional(),
  utmContent: text(200).optional(),
  fbclid: text(200).optional(),
})

const DAY_MS = 24 * 60 * 60 * 1000
const done = () => new NextResponse(null, { status: 204 })

export async function POST(request: Request) {
  const limited = await rateLimit(request, 'marketingEvent')
  if (limited) return limited

  try {
    // Nothing to do unless Meta server events are configured and this visitor consented
    if (!getMetaCapiConfig() || readConsentCookie(request) !== 'all') return done()

    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return done()
    const { eventId, eventName, timestamp, ...rest } = parsed.data
    if (!CAPI_RELAY_EVENTS.has(eventName as never)) return done()

    const now = Date.now()
    const data: MarketingEventData = { ...rest, eventId, client: readClientContext(request) }
    const event = buildEvent(eventName as never, data, { source: 'server', consent: 'all' })
    // the action time is the browser's, but never far from now (Meta rejects old events)
    event.timestamp = timestamp && Math.abs(now - timestamp) < DAY_MS ? timestamp : now
    if (missingFields(event).length > 0) return done()

    await serverDispatcher.dispatch(event)
  } catch (error) {
    console.warn('[marketing] relayed event failed:', error instanceof Error ? error.message : error)
  }
  return done()
}
