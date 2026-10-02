import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { cancelProductionOrder } from '@/lib/services/production.service'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(request, 'PRODUCTION_MANAGE')
    const { id } = await params
    const body = (await request.json().catch(() => ({}))) as { reason?: string }
    const result = await cancelProductionOrder(id, body.reason, user.id)
    if (!result.success) return NextResponse.json({ success: false, error: result.error }, { status: 422 })
    return NextResponse.json({ success: true, order: result.order })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'İş iptal edilemedi.'
    return NextResponse.json({ success: false, error: message }, { status: message.includes('FORBIDDEN') ? 403 : 500 })
  }
}
