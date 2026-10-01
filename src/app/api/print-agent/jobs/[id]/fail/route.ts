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
    const body = await request.json().catch(() => ({}))

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Agent yetkilendirmesi (Bearer token) zorunludur.' },
        { status: 401 }
      )
    }

    const job = await PrintAgentService.failJob(
      id,
      body.error || 'Yazdırma hatası (TCP 9100 / Printer error)',
      token
    )

    return NextResponse.json({
      success: true,
      job,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Yazdırma hata bildirimi başarısız.' },
      { status: 400 }
    )
  }
}
