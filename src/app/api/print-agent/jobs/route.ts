import { NextResponse } from 'next/server'
import { PrintAgentService } from '@/lib/services/warehouse/print-agent.service'

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null
    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agentId') || request.headers.get('x-agent-id')

    if (!token || !agentId) {
      return NextResponse.json(
        { success: false, error: 'Agent yetkilendirmesi (Bearer token) ve agentId zorunludur.' },
        { status: 401 }
      )
    }

    const jobs = await PrintAgentService.pollPendingJobs(agentId, token)

    return NextResponse.json({
      success: true,
      count: jobs.length,
      jobs,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Yazdırma işleri alınamadı.' },
      { status: 400 }
    )
  }
}
