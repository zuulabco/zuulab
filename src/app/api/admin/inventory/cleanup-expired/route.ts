import { NextResponse } from 'next/server'
import { cleanupExpiredReservations } from '@/lib/services/payment/payment.service'
import { verifyCronAuthorization } from '@/lib/services/cron/cron-lock.service'

/**
 * Endpoint for scheduled cron or admin manual trigger to release
 * expired inventory reservations (e.g. abandoned checkout sessions).
 */
export async function POST(request: Request) {
  try {
    const auth = verifyCronAuthorization(request)
    if (!auth.authorized) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
    }

    const result = await cleanupExpiredReservations()

    return NextResponse.json({
      success: true,
      cleanedCount: result.cleanedCount,
      expiredOrders: result.expiredOrders,
      message: `${result.cleanedCount} adet zaman aşımına uğramış rezervasyon temizlendi.`,
    })
  } catch (error: any) {
    console.error('[inventory/cleanup-expired] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Rezervasyon temizliği başarısız.' },
      { status: 500 }
    )
  }
}
