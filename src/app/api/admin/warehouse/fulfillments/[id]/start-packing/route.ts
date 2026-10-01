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
    let body: any = {}
    try {
      body = await request.json()
    } catch {}

    const session = await PackingService.startPackingSession({
      fulfillmentId: params.id,
      operatorId: user.id || 'op_current',
      packageCount: body.packageCount ? Number(body.packageCount) : 1,
    })

    return NextResponse.json({
      success: true,
      session,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Paketleme başlatılamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : error.statusCode || 400 }
    )
  }
}
