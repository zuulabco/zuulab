import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { getOrderByNumber } from '@/lib/services/orders.service'
import { OrderDeleteError, deleteOrder } from '@/lib/services/order-delete.service'

interface Context {
  params: Promise<{ orderNumber: string }>
}

export async function GET(request: Request, { params }: Context) {
  try {
    await requirePermission(request, 'ORDER_VIEW')
    const { orderNumber } = await params

    const order = await getOrderByNumber(orderNumber, undefined, true)
    if (!order) {
      return NextResponse.json({ success: false, error: 'Sipariş bulunamadı.' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      order,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}

/**
 * DELETE { confirm: "<order number>" } → permanently deletes the order (Super Admin only).
 * Refused for marketplace orders, orders with an invoice and orders with a return.
 */
export async function DELETE(request: Request, { params }: Context) {
  try {
    const user = await requirePermission(request, 'ORDER_DELETE')
    const { orderNumber } = await params
    const body = (await request.json().catch(() => null)) as { confirm?: unknown } | null
    const deleted = await deleteOrder(orderNumber, typeof body?.confirm === 'string' ? body.confirm : '', { id: user.id, email: user.email })
    return NextResponse.json({ success: true, deleted })
  } catch (error: any) {
    if (error instanceof OrderDeleteError) return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    const isForbidden = error.message?.includes('FORBIDDEN')
    if (!isForbidden) console.error('[admin/orders DELETE]', error)
    return NextResponse.json(
      { success: false, error: isForbidden ? error.message : 'Sipariş silinemedi.' },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
