import { NextResponse } from 'next/server'
import { ShippingWebhookService } from '@/lib/services/shipping/webhook/webhook.service'
import { ShippingService } from '@/lib/services/shipping/shipping.service'
import type { CarrierProviderType, ShippingShipmentStatus } from '@/lib/services/shipping/shipping-types'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider } = await params
    const providerKey = provider.toUpperCase() as CarrierProviderType
    const rawBody = await request.text()

    const signature =
      request.headers.get('x-shipping-signature') ||
      request.headers.get('x-carrier-signature') ||
      request.headers.get('x-signature') ||
      request.headers.get('authorization')?.replace('Bearer ', '') ||
      null

    const timestampHeader =
      request.headers.get('x-shipping-timestamp') ||
      request.headers.get('x-timestamp') ||
      null

    const result = await ShippingWebhookService.processWebhook(
      {
        provider: providerKey,
        rawBody,
        signature,
        timestamp: timestampHeader,
      },
      async (identifier, newStatus, rawPayload) => {
        // Shipment Lookup
        let targetShipment = null
        if (identifier.trackingNumber) {
          targetShipment = await ShippingService.findShipmentByTrackingNumber(identifier.trackingNumber)
        }
        if (!targetShipment && identifier.externalShipmentId) {
          targetShipment = await ShippingService.getShipmentById(identifier.externalShipmentId).catch(() => null)
        }

        if (!targetShipment) {
          throw new Error(`Kargo gönderisi bulunamadı (Takip: ${identifier.trackingNumber || identifier.externalShipmentId})`)
        }

        const updated = await ShippingService.updateShipmentStatus(targetShipment.id, newStatus, {
          description: `Taşıyıcı webhook bildirimi (${providerKey})`,
          payload: rawPayload,
        })

        return {
          shipmentId: updated.id,
          status: updated.status,
        }
      }
    )

    return NextResponse.json({
      success: true,
      result,
    })
  } catch (error: any) {
    console.error('[CarrierWebhook] Processing error:', error.message)
    const isInvalid = error.message?.includes('imza') || error.message?.includes('Replay') || error.message?.includes('JSON')
    return NextResponse.json(
      { success: false, error: error.message || 'Webhook işlenemedi.' },
      { status: isInvalid ? 400 : 500 }
    )
  }
}
