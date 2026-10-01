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

    const testShipmentId = `TEST-${Date.now()}`
    const result = await PrintAgentService.requestPrintJob({
      printerId: id,
      shipmentId: testShipmentId,
      format: 'ZPL',
      requestedBy: user.name || user.email || 'Admin',
      isReprint: true,
      labelVersion: 'test',
    })

    return NextResponse.json({
      success: true,
      message: 'Test yazdırma işi kuyruğa alındı.',
      job: result.job,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Test yazdırma başarısız.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}
