import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { getOrderByNumber } from '@/lib/services/orders.service'

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
