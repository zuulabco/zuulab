import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { completeProductionOrder } from '@/lib/services/production.service'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission(request, 'PRODUCTION_MANAGE')
    const { id } = await params
    const body = await request.json()
    const { completedQuantity, failedQuantity, notes } = body
    if (completedQuantity == null) {
      return NextResponse.json({ success: false, error: 'completedQuantity zorunludur.' }, { status: 400 })
    }
    const result = await completeProductionOrder(id, { completedQuantity: Number(completedQuantity), failedQuantity: Number(failedQuantity || 0), notes }, user.id)
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 422 })
    }
    return NextResponse.json({ success: true, order: result.order })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json({ success: false, error: error.message }, { status: isForbidden ? 403 : isAuth ? 401 : 500 })
  }
}