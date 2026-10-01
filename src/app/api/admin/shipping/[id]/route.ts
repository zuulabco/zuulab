import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { ShippingService } from '@/lib/services/shipping/shipping.service'
import { LabelService } from '@/lib/services/shipping/label/label.service'
import { ShippingQueueService } from '@/lib/services/shipping/queue/shipping-queue.service'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission(request, 'SHIPPING_VIEW')
    const { id } = await params

    const shipment = await ShippingService.getShipmentById(id)
    const labels = await LabelService.getLabelsForShipment(id)
    const events = await ShippingService.getShipmentEvents(id)
    const queueJobs = await ShippingQueueService.getJobsForShipment(id)

    return NextResponse.json({
      success: true,
      shipment,
      labels,
      events,
      queueJobs,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isNotFound = error.message?.includes('bulunamadı')
    return NextResponse.json(
      { success: false, error: error.message || 'Kargo detayı alınamadı.' },
      { status: isForbidden ? 403 : isNotFound ? 404 : 500 }
    )
  }
}
