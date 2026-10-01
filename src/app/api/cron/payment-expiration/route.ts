import { NextResponse } from 'next/server'
import { verifyCronAuthorization, acquireCronLock, releaseCronLock } from '@/lib/services/cron/cron-lock.service'
import { cleanupExpiredReservations } from '@/lib/services/payment/payment.service'

export const dynamic = 'force-dynamic'

/**
 * Scheduled Cron Job: Payment Expiration
 * Cancels expired checkout sessions and releases reserved stocks.
 * Protected by CRON_SECRET and concurrency lock.
 */
export async function GET(request: Request) {
  return POST(request)
}

export async function POST(request: Request) {
  const auth = verifyCronAuthorization(request)
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }

  const lock = await acquireCronLock('payment_expiration', 180)
  if (!lock.acquired) {
    return NextResponse.json({
      success: false,
      message: 'Skipped: Job is already running in another instance.',
      reason: lock.reason,
    }, { status: 409 })
  }

  try {
    const result = await cleanupExpiredReservations()
    return NextResponse.json({
      success: true,
      job: 'payment-expiration',
      cleanedCount: result.cleanedCount,
      expiredOrders: result.expiredOrders,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('[cron/payment-expiration] Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  } finally {
    await releaseCronLock('payment_expiration')
  }
}
