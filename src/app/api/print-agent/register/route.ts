import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { PrintAgentService } from '@/lib/services/warehouse/print-agent.service'

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'WAREHOUSE_PRINTER_MANAGE')
    const body = await request.json()

    if (!body.printerId || !body.agentId) {
      return NextResponse.json(
        { success: false, error: 'printerId ve agentId zorunludur.' },
        { status: 400 }
      )
    }

    const result = await PrintAgentService.registerAgent({
      printerId: body.printerId,
      agentId: body.agentId,
      adminUserId: user.name || user.email || 'Admin',
    })

    return NextResponse.json({
      success: true,
      agentId: result.agentId,
      token: result.rawToken,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Agent kaydedilemedi.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}
