import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { ShippingService } from '@/lib/services/shipping/shipping.service'
import { ShippingQueueService } from '@/lib/services/shipping/queue/shipping-queue.service'
import { logAuditEvent } from '@/lib/services/admin.service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission(request, 'SHIPPING_MANAGE')
    const { id } = await params

    const shipment = await ShippingService.getShipmentById(id)

    // Reset status to READY_TO_SHIP if failed
    if (shipment.status === 'FAILED') {
      await ShippingService.updateShipmentStatus(id, 'READY_TO_SHIP', {
        description: 'Yönetici tarafından kargo işlemi yeniden denendi.',
      })
    }

    // Enqueue retry job
    const job = await ShippingQueueService.enqueue({
      shipmentId: id,
      jobType: 'CREATE_LABEL',
    })

    await logAuditEvent({
      action: 'shipping.retry.triggered',
      entity: 'ShippingShipment',
      entityId: id,
      metadata: { jobId: job.id },
    })

    return NextResponse.json({
      success: true,
      message: 'Kargo işlemi yeniden deneme kuyruğuna alındı.',
      jobId: job.id,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message || 'Yeniden deneme başlatılamadı.' },
      { status: isForbidden ? 403 : 400 }
    )
  }
}
