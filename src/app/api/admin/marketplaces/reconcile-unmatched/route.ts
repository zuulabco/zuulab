import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { reconcileUnmatchedOrders } from '@/lib/services/marketplace/marketplace.service'

export async function POST(request: Request) {
  try {
    const user = await requireAdmin(request)
    const body = (await request.json().catch(() => ({}))) as { storeId?: string }

    const result = await reconcileUnmatchedOrders(body.storeId, user.id)

    return NextResponse.json({
      success: true,
      message: `${result.checkedCount} adet eşleşmemiş sipariş kontrol edildi, ${result.updatedCount} tanesi güncel eşleştirmelerle bağlandı.`,
      result,
    })
  } catch (error: any) {
    const isForbidden =
      error.message?.includes('FORBIDDEN') ||
      error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Toplu yeniden eşleştirme gerçekleştirilemedi.',
      },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
