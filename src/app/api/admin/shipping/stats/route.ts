import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { BulkShippingService } from '@/lib/services/shipping/bulk-shipping.service'

export async function GET(request: Request) {
  try {
    const user = await requirePermission(request, 'SHIPPING_VIEW')
    const stats = await BulkShippingService.getDailyShippingStats((user as any).storeId || null)

    return NextResponse.json({
      success: true,
      stats,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Kargo istatistikleri alınamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 500 }
    )
  }
}
