import { NextResponse } from 'next/server'
import { handleShippingWebhook } from '@/lib/services/shipping/fulfillment.service'
import type { ShipmentStatus } from '@/lib/services/shipping/shipping.interface'

export async function POST(request: Request) {
  try {
    const rawBody = await request.text()
    const signature =
      request.headers.get('x-shipping-signature') ||
      request.headers.get('x-carrier-signature') ||
      request.headers.get('authorization') ||
      ''

    let payload: any = {}
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON payload' },
        { status: 400 }
      )
    }

    const providerName = (payload.provider || request.headers.get('x-shipping-provider') || 'MOCK').toUpperCase()
    const trackingNumber = payload.trackingNumber || payload.cargoKey || payload.barcode
    const status = (payload.status || 'IN_TRANSIT') as ShipmentStatus

    if (!trackingNumber) {
      return NextResponse.json(
        { success: false, error: 'Missing trackingNumber in webhook payload' },
        { status: 400 }
      )
    }

    const result = await handleShippingWebhook({
      providerName,
      payload: {
        trackingNumber,
        status,
        description: payload.description || payload.statusText,
        location: payload.location,
        timestamp: payload.timestamp || payload.eventTime,
        eventRef: payload.eventRef || payload.eventId,
      },
      signature,
      rawBody,
    })

    return NextResponse.json({
      success: true,
      message: result.message,
      shipmentId: result.shipmentId,
    })
  } catch (error: any) {
    console.error('[shipping/webhook] Error handling carrier webhook:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Webhook processing failed' },
      { status: 400 }
    )
  }
}
