import { NextResponse } from 'next/server'
import { verifyCronAuthorization, acquireCronLock, releaseCronLock } from '@/lib/services/cron/cron-lock.service'
import { syncActiveShipmentsTracking } from '@/lib/services/shipping/fulfillment.service'
import { ShippingQueueService } from '@/lib/services/shipping/queue/shipping-queue.service'
import { ShippingService } from '@/lib/services/shipping/shipping.service'
import { LabelService } from '@/lib/services/shipping/label/label.service'

export const dynamic = 'force-dynamic'

/**
 * Scheduled Cron Job: Shipping Tracking Synchronization
 * Polling carrier web services (Sürat, Yurtiçi) for active shipments and updating delivery statuses.
 */
export async function GET(request: Request) {
  return POST(request)
}

export async function POST(request: Request) {
  const auth = verifyCronAuthorization(request)
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }

  const lock = await acquireCronLock('shipping_sync', 300)
  if (!lock.acquired) {
    return NextResponse.json({
      success: false,
      message: 'Skipped: Shipping synchronization is actively running in another instance.',
      reason: lock.reason,
    }, { status: 409 })
  }

  try {
    const queueResult = await ShippingQueueService.processQueue({
      CREATE_SHIPMENT: async (job) => {
        if (job.payload) {
          await ShippingService.createShipment(job.payload as any)
        }
      },
      CREATE_LABEL: async (job) => {
        const s = await ShippingService.getShipmentById(job.shipmentId)
        await LabelService.generateLabel(s, 'PDF', true)
      },
      POLL_LABEL: async () => {},
      UPDATE_TRACKING: async (job) => {
        await ShippingService.syncTracking(job.shipmentId)
      },
      UPDATE_MARKETPLACE: async () => {},
      CANCEL_SHIPMENT: async (job) => {
        await ShippingService.cancelShipment(job.shipmentId)
      },
    })

    const result = await syncActiveShipmentsTracking()
    return NextResponse.json({
      success: true,
      job: 'shipping-sync',
      queueProcessed: queueResult.processed,
      syncedCount: result.syncedCount,
      updatedCount: result.updatedCount,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('[cron/shipping-sync] Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  } finally {
    await releaseCronLock('shipping_sync')
  }
}
