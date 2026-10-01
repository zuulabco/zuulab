import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { reconcileMarketplaceOrder } from '@/lib/services/marketplace/marketplace.service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAdmin(request)
    const { id } = await params

    const order = await reconcileMarketplaceOrder(id, user.id)
    if (!order) {
      return NextResponse.json(
        { success: false, error: 'Sipariş bulunamadı.' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Sipariş ürün eşleştirmeleri güncel katalog ile yeniden doğrulandı.',
      order,
    })
  } catch (error: any) {
    const isForbidden =
      error.message?.includes('FORBIDDEN') ||
      error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Sipariş yeniden eşleştirilemedi.',
      },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
