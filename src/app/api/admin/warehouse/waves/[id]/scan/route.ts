import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { WavePickingService } from '@/lib/services/warehouse/wave-picking.service'

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(request, 'WAREHOUSE_PICK')
    const { id } = await props.params
    const body = await request.json()

    if (!body.barcode || !body.clientRequestId) {
      return NextResponse.json(
        { success: false, error: 'barcode ve clientRequestId zorunludur.' },
        { status: 400 }
      )
    }

    const result = await WavePickingService.scanWaveItem({
      waveId: id,
      barcode: body.barcode,
      locationBarcode: body.locationBarcode,
      operatorId: user.name || user.email || 'operator_1',
      clientRequestId: body.clientRequestId,
      quantity: body.quantity ? Number(body.quantity) : 1,
    })

    return NextResponse.json({
      success: true,
      waveItem: result.waveItem,
      scannedQuantity: result.scannedQuantity,
      isWaveComplete: result.isWaveComplete,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Barkod okutma başarısız.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}
