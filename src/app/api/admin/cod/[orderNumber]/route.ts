import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import {
  addOrderToGeliver,
  buyCodLabel,
  getCodBalanceInfo,
  getCodDetail,
  prepareCodShipment,
  removeCodDraft,
} from '@/lib/services/shipping/cod.service'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function fail(error: any, fallback: string) {
  const isForbidden = error.message?.includes('FORBIDDEN')
  const isAuth = error.message?.includes('UNAUTHORIZED')
  return NextResponse.json({ success: false, error: error.message || fallback }, { status: isForbidden ? 403 : isAuth ? 401 : 400 })
}

export async function GET(request: Request, { params }: { params: Promise<{ orderNumber: string }> }) {
  try {
    await requireAdmin(request)
    const { orderNumber } = await params
    const [detail, balance] = await Promise.all([getCodDetail(orderNumber), getCodBalanceInfo()])
    return NextResponse.json({ success: true, ...detail, balance })
  } catch (error: any) {
    return fail(error, 'Sipariş bilgisi alınamadı.')
  }
}

/** Body: { action: 'add' | 'prepare' | 'buy' | 'remove', address?, parcel? } */
export async function POST(request: Request, { params }: { params: Promise<{ orderNumber: string }> }) {
  try {
    const admin = await requireAdmin(request)
    const { orderNumber } = await params
    const body = await request.json().catch(() => ({}))

    switch (body.action) {
      case 'add':
        return NextResponse.json({ success: true, ...(await addOrderToGeliver(orderNumber, admin.email)) })
      case 'prepare':
        return NextResponse.json({
          success: true,
          ...(await prepareCodShipment({ orderNumber, address: body.address, parcel: body.parcel, requestedBy: admin.email })),
        })
      case 'buy':
        return NextResponse.json({ success: true, ...(await buyCodLabel(orderNumber, admin.email)) })
      case 'remove':
        await removeCodDraft(orderNumber, admin.email)
        return NextResponse.json({ success: true, message: 'Sipariş Geliver’den kaldırıldı.' })
      default:
        return NextResponse.json({ success: false, error: 'Geçersiz işlem.' }, { status: 400 })
    }
  } catch (error: any) {
    console.error('[admin/cod] Error:', error)
    return fail(error, 'İşlem yapılamadı.')
  }
}
