import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { ShippingService } from '@/lib/services/shipping/shipping.service'
import { LabelService } from '@/lib/services/shipping/label/label.service'
import type { ShippingLabelFormat } from '@/lib/services/shipping/shipping-types'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission(request, 'SHIPPING_LABEL')
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const format = (searchParams.get('format') || 'PDF').toUpperCase() as ShippingLabelFormat

    const shipment = await ShippingService.getShipmentById(id)
    const label = await LabelService.generateLabel(shipment, format, false)

    return NextResponse.json({
      success: true,
      label,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message || 'Etiket alınamadı.' },
      { status: isForbidden ? 403 : 400 }
    )
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission(request, 'SHIPPING_LABEL')
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const format = (body.format || 'PDF').toUpperCase() as ShippingLabelFormat
    const regenerate = Boolean(body.regenerate)

    const shipment = await ShippingService.getShipmentById(id)
    const label = await LabelService.generateLabel(shipment, format, regenerate)

    return NextResponse.json({
      success: true,
      label,
      regenerated: regenerate,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message || 'Etiket oluşturulamadı.' },
      { status: isForbidden ? 403 : 400 }
    )
  }
}
