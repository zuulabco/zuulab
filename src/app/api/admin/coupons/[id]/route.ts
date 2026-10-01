import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { adminUpdateCoupon, adminToggleCoupon } from '@/lib/services/coupons-admin.service'

interface Context {
  params: Promise<{ id: string }>
}

export async function PUT(request: Request, { params }: Context) {
  try {
    const user = await requirePermission(request, 'COUPON_MANAGE')
    const { id } = await params
    const body = await request.json().catch(() => ({}))

    const updated = await adminUpdateCoupon(id, body, user.email)

    return NextResponse.json({
      success: true,
      message: 'Kupon güncellendi.',
      coupon: updated,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const user = await requirePermission(request, 'COUPON_MANAGE')
    const { id } = await params

    const deactivated = await adminToggleCoupon(id, false, user.email)

    return NextResponse.json({
      success: true,
      message: 'Kupon pasife alındı.',
      coupon: deactivated,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
