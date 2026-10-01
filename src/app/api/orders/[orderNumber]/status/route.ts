import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { updateOrderStatus } from '@/lib/services/orders.service'

interface Context {
  params: Promise<{ orderNumber: string }>
}

export async function POST(request: Request, { params }: Context) {
  try {
    const admin = await requireAdmin(request)
    const { orderNumber } = await params
    const body = await request.json().catch(() => ({}))
    const { status, note } = body

    if (!status) {
      return NextResponse.json(
        { success: false, error: 'Yeni sipariş durumu (status) belirtilmelidir.' },
        { status: 400 }
      )
    }

    const result = await updateOrderStatus(
      orderNumber,
      status,
      note,
      `admin:${admin.email}`
    )

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      order: result.order,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Sipariş durumu güncellenemedi.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 500 }
    )
  }
}
