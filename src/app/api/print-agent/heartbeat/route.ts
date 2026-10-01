import { NextResponse } from 'next/server'
import { PrintAgentService } from '@/lib/services/warehouse/print-agent.service'

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null
    const body = await request.json().catch(() => ({}))
    const agentId = body.agentId || request.headers.get('x-agent-id')

    if (!token || !agentId) {
      return NextResponse.json(
        { success: false, error: 'Agent yetkilendirmesi (Bearer token) ve agentId zorunludur.' },
        { status: 401 }
      )
    }

    const res = await PrintAgentService.recordHeartbeat(agentId, token)

    return NextResponse.json({
      success: true,
      lastHeartbeatAt: res.lastHeartbeatAt,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Heartbeat kaydedilemedi.' },
      { status: 400 }
    )
  }
}
