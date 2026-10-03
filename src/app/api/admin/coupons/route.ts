import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { adminGetCouponsWithStats, adminCreateCoupon } from '@/lib/services/coupons-admin.service'

export async function GET(request: Request) {
  try {
    await requirePermission(request, 'COUPON_MANAGE')
    const source = new URL(request.url).searchParams.get('source') === 'NEWSLETTER' ? 'NEWSLETTER' : 'MANUAL'
    const coupons = await adminGetCouponsWithStats(source)

    return NextResponse.json({
      success: true,
      total: coupons.length,
      coupons,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'COUPON_MANAGE')
    const body = await request.json().catch(() => ({}))

    if (!body.code || !body.type || body.discountValue === undefined) {
      return NextResponse.json(
        { success: false, error: 'Kupon kodu, türü ve indirim tutarı zorunludur.' },
        { status: 400 }
      )
    }

    const created = await adminCreateCoupon(body, user.email)

    return NextResponse.json({
      success: true,
      message: 'Kupon başarıyla oluşturuldu.',
      coupon: created,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
