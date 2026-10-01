import { NextResponse } from 'next/server'
import { verifyCronAuthorization, acquireCronLock, releaseCronLock } from '@/lib/services/cron/cron-lock.service'
import { processPendingNotifications } from '@/lib/services/notification/notification.service'

export const dynamic = 'force-dynamic'

/**
 * Scheduled Cron Job: Transactional Notification Queue Dispatch
 * Processes pending and failed email notifications with deterministic idempotency.
 */
export async function GET(request: Request) {
  return POST(request)
}

export async function POST(request: Request) {
  const auth = verifyCronAuthorization(request)
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }

  const lock = await acquireCronLock('notifications_process', 240)
  if (!lock.acquired) {
    return NextResponse.json({
      success: false,
      message: 'Skipped: Notification queue processor is already active.',
      reason: lock.reason,
    }, { status: 409 })
  }

  try {
    const result = await processPendingNotifications()
    return NextResponse.json({
      success: true,
      job: 'notifications-process',
      processedCount: result.processedCount,
      successCount: result.successCount,
      failedCount: result.failedCount,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('[cron/notifications-process] Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  } finally {
    await releaseCronLock('notifications_process')
  }
}
