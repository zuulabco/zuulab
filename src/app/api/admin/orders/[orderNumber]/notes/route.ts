import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { getOrderByNumber } from '@/lib/services/orders.service'
import { logAuditEvent } from '@/lib/services/admin.service'

interface Context {
  params: Promise<{ orderNumber: string }>
}

export async function POST(request: Request, { params }: Context) {
  try {
    const user = await requirePermission(request, 'ORDER_UPDATE')
    const { orderNumber } = await params
    const body = await request.json().catch(() => ({}))
    const { note } = body

    if (!note || typeof note !== 'string') {
      return NextResponse.json({ success: false, error: 'Not içeriği belirtilmelidir.' }, { status: 400 })
    }

    const order = await getOrderByNumber(orderNumber, undefined, true)
    if (!order) {
      return NextResponse.json({ success: false, error: 'Sipariş bulunamadı.' }, { status: 404 })
    }

    // Append internal note to order status history
    const historyItem = {
      id: `note-${Date.now()}`,
      status: order.status,
      note: `[Dahili Not] ${note}`,
      createdAt: new Date().toISOString(),
      createdBy: `admin:${user.email}`,
    }
    order.statusHistory.unshift(historyItem)

    await logAuditEvent({
      action: 'ORDER_INTERNAL_NOTE_ADDED',
      entity: 'Order',
      entityId: orderNumber,
      metadata: { note, adminEmail: user.email },
    })

    return NextResponse.json({
      success: true,
      message: 'Dahili not eklendi.',
      noteItem: historyItem,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
