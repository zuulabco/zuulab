import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { PrintAgentService } from '@/lib/services/warehouse/print-agent.service'

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission(request, 'WAREHOUSE_PRINTER_VIEW')
    const { id } = await props.params

    const printer = await PrintAgentService.getPrinter(id)
    const isOnline = PrintAgentService.isPrinterOnline(printer)

    return NextResponse.json({
      success: true,
      printer: {
        ...printer,
        isOnline,
      },
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Yazıcı bulunamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 404 }
    )
  }
}
