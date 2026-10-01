import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { getMarketplaceOrderById } from '@/lib/services/marketplace/marketplace.service'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(request)
    const { id } = await params

    const order = await getMarketplaceOrderById(id)
    if (!order) {
      return NextResponse.json(
        { success: false, error: 'Pazaryeri siparişi bulunamadı.' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      order,
    })
  } catch (error: any) {
    const isForbidden =
      error.message?.includes('FORBIDDEN') ||
      error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Sipariş detayları alınamadı.',
      },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
