import { NextResponse } from 'next/server'
import { PrintAgentService } from '@/lib/services/warehouse/print-agent.service'

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null
    const { id } = await props.params

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Agent yetkilendirmesi (Bearer token) zorunludur.' },
        { status: 401 }
      )
    }

    const job = await PrintAgentService.completeJob(id, token)

    return NextResponse.json({
      success: true,
      job,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Yazdırma tamamlama bildirimi başarısız.' },
      { status: 400 }
    )
  }
}
