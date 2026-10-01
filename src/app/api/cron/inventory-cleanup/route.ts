import { NextResponse } from 'next/server'
import { verifyCronAuthorization, acquireCronLock, releaseCronLock } from '@/lib/services/cron/cron-lock.service'
import { cleanupExpiredReservations } from '@/lib/services/payment/payment.service'

export const dynamic = 'force-dynamic'

/**
 * Scheduled Cron Job: Inventory Cleanup
 * Releases expired cart / checkout stock reservations.
 */
export async function GET(request: Request) {
  return POST(request)
}

export async function POST(request: Request) {
  const auth = verifyCronAuthorization(request)
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }

  const lock = await acquireCronLock('inventory_cleanup', 180)
  if (!lock.acquired) {
    return NextResponse.json({
      success: false,
      message: 'Skipped: Inventory cleanup is actively running in another serverless instance.',
      reason: lock.reason,
    }, { status: 409 })
  }

  try {
    const result = await cleanupExpiredReservations()
    return NextResponse.json({
      success: true,
      job: 'inventory-cleanup',
      releasedReservations: result.cleanedCount,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('[cron/inventory-cleanup] Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  } finally {
    await releaseCronLock('inventory_cleanup')
  }
}
