import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { PackingService } from '@/lib/services/warehouse/packing.service'

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(request, 'WAREHOUSE_PACK')
    const params = await props.params
    const body = await request.json()

    if (!body.barcode) {
      return NextResponse.json(
        { success: false, error: 'Barkod girilmelidir.' },
        { status: 400 }
      )
    }

    const result = await PackingService.scanPackItem({
      fulfillmentId: params.id,
      operatorId: user.id || 'op_current',
      barcode: body.barcode,
      clientRequestId: body.clientRequestId || `req_pack_${Date.now()}`,
      quantity: body.quantity ? Number(body.quantity) : 1,
    })

    return NextResponse.json(result)
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Paketleme ürün okutma işlemi başarısız.',
        code: error.code || 'PACK_FAILED',
      },
      { status: isForbidden ? 403 : isAuth ? 401 : error.statusCode || 422 }
    )
  }
}
