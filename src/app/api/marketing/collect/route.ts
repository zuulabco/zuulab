import { NextResponse } from 'next/server'
import { z } from 'zod'
import { rateLimit } from '@/lib/security/rate-limit-response'
import { buildEvent, isCanonicalEvent, type MarketingEventData } from '@/lib/marketing/events'
import { readConsentCookie } from '@/lib/marketing/request-context'
import { eventRow } from '@/lib/analytics/internal'
import { storeEvent } from '@/lib/services/analytics/internal-analytics.service'

export const dynamic = 'force-dynamic'

/**
 * Receives the browser's canonical events for ZUULAB's own analytics (marketing_events).
 *
 * Trust: the visitor's consent comes from the consent cookie, not from the body; only a
 * fixed list of short fields is accepted; `purchase` is never stored from here (sales come
 * from the orders table); the user id is never taken from the body. The answer is always
 * 204 so tracking never shows up as a page error.
 */

const text = (max: number) => z.string().max(max)
const money = z.number().finite().min(0).max(10_000_000)

const bodySchema = z.object({
  eventId: z.string().min(8).max(100),
  eventName: z.string(),
  timestamp: z.number().finite().optional(),
  pageUrl: text(2000).optional(),
  anonymousId: text(64).optional(),
  sessionId: text(64).optional(),
  productId: text(100).optional(),
  quantity: z.number().int().min(1).max(1000).optional(),
  price: money.optional(),
  value: money.optional(),
  items: z.array(z.object({ productId: text(100), productName: text(300), quantity: z.number().int().min(1).max(1000), price: money })).max(100).optional(),
  utmSource: text(200).optional(),
  utmMedium: text(200).optional(),
  utmCampaign: text(200).optional(),
  utmContent: text(200).optional(),
})

const DAY_MS = 24 * 60 * 60 * 1000
const done = () => new NextResponse(null, { status: 204 })

export async function POST(request: Request) {
  const limited = await rateLimit(request, 'analyticsCollect')
  if (limited) return limited

  try {
    if (readConsentCookie(request) !== 'all') return done()
    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success || !isCanonicalEvent(parsed.data.eventName)) return done()
    const { eventId, eventName, timestamp, ...rest } = parsed.data

    const event = buildEvent(eventName, { ...rest, eventId } as MarketingEventData, { source: 'server', consent: 'all' })
    // the action time is the browser's, but never far from now
    const now = Date.now()
    event.timestamp = timestamp && Math.abs(now - timestamp) < DAY_MS ? timestamp : now

    const row = eventRow(event)
    if (row) await storeEvent(row)
  } catch (error) {
    console.warn('[analytics/collect] failed:', error instanceof Error ? error.message : error)
  }
  return done()
}
