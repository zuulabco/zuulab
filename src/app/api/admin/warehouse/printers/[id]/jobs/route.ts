import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { PrintAgentService } from '@/lib/services/warehouse/print-agent.service'

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(request, 'WAREHOUSE_PRINT')
    const { id } = await props.params
    const body = await request.json()

    if (!body.shipmentId) {
      return NextResponse.json(
        { success: false, error: 'shipmentId parametresi zorunludur.' },
        { status: 400 }
      )
    }

    const result = await PrintAgentService.requestPrintJob({
      printerId: id,
      shipmentId: body.shipmentId,
      labelId: body.labelId,
      format: body.format || 'ZPL',
      requestedBy: user.name || user.email || 'Admin',
      isReprint: Boolean(body.isReprint),
      labelVersion: body.labelVersion,
    })

    return NextResponse.json({
      success: true,
      job: result.job,
      idempotent: result.idempotent,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Yazdırma isteği oluşturulamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}
