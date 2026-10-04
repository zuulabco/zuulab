import crypto from 'crypto'
import { NextResponse } from 'next/server'
import { applyShipmentUpdate, findShipmentByProviderShipmentId } from '@/lib/services/shipping/fulfillment.service'
import { geliverToShipmentStatus } from '@/lib/services/shipping/geliver/geliver.provider'
import type { GeliverShipment } from '@/lib/services/shipping/geliver/geliver.client'

export const dynamic = 'force-dynamic'

/**
 * Geliver tracking webhook (TRACK_UPDATED): shipment status, tracking number/link,
 * delivery, and for kapıda ödeme the payment collected at the door.
 *
 * Geliver does not sign webhooks yet, so the URL registered with Geliver carries a
 * secret: ?token=<GELIVER_WEBHOOK_SECRET> (or an X-Webhook-Secret header). Without
 * the secret configured, every call is refused.
 */
function authorized(request: Request): boolean {
  const secret = process.env.GELIVER_WEBHOOK_SECRET?.trim()
  if (!secret) return false
  const given = new URL(request.url).searchParams.get('token') || request.headers.get('x-webhook-secret') || ''
  const a = Buffer.from(given)
  const b = Buffer.from(secret)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as { event?: string; data?: GeliverShipment } | null
  if (!body?.data?.id || body.event !== 'TRACK_UPDATED') {
    // Acknowledged so Geliver does not retry events we do not use
    return NextResponse.json({ success: true, ignored: true })
  }

  const data = body.data
  const shipment = await findShipmentByProviderShipmentId(data.id)
  if (!shipment) {
    console.warn('[geliver/webhook] Unknown shipment', data.id)
    return NextResponse.json({ success: true, ignored: true })
  }

  const ts = data.trackingStatus
  const status = geliverToShipmentStatus(ts)
  const result = await applyShipmentUpdate(shipment, {
    status,
    description: ts?.statusDetails || undefined,
    location: ts?.locationName || undefined,
    eventAt: ts?.statusDate || ts?.updatedAt || undefined,
    dedupeKey: `geliver:${(ts as { id?: string } | null | undefined)?.id || `${ts?.trackingStatusCode}:${ts?.trackingSubStatusCode}:${ts?.statusDate || ts?.updatedAt}`}`,
    trackingNumber: data.trackingNumber || undefined,
    trackingUrl: data.trackingUrl || undefined,
    rawPayload: { trackingStatus: ts, trackingNumber: data.trackingNumber, trackingUrl: data.trackingUrl },
    source: 'GELIVER',
  })
  return NextResponse.json(result)
}
