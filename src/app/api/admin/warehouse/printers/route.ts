import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { PrintAgentService } from '@/lib/services/warehouse/print-agent.service'

export async function GET(request: Request) {
  try {
    await requirePermission(request, 'WAREHOUSE_PRINTER_VIEW')
    const { searchParams } = new URL(request.url)
    const warehouseId = searchParams.get('warehouseId') || undefined

    const printers = await PrintAgentService.listPrinters({ warehouseId })

    return NextResponse.json({
      success: true,
      count: printers.length,
      printers,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Yazıcılar listelenemedi.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'WAREHOUSE_PRINTER_MANAGE')
    const body = await request.json()

    if (!body.name || !body.ipAddress) {
      return NextResponse.json(
        { success: false, error: 'Yazıcı adı (name) ve IP adresi (ipAddress) zorunludur.' },
        { status: 400 }
      )
    }

    const printer = await PrintAgentService.registerPrinter({
      warehouseId: body.warehouseId || 'MAIN',
      name: body.name,
      printerType: body.printerType || 'ZEBRA_ZPL',
      ipAddress: body.ipAddress,
      port: body.port ? Number(body.port) : 9100,
      dpi: body.dpi ? Number(body.dpi) : 203,
      labelWidthMm: body.labelWidthMm ? Number(body.labelWidthMm) : 100,
      labelHeightMm: body.labelHeightMm ? Number(body.labelHeightMm) : 100,
      isDefault: Boolean(body.isDefault),
      agentId: body.agentId,
    })

    return NextResponse.json({
      success: true,
      printer,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Yazıcı kaydedilemedi.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}
