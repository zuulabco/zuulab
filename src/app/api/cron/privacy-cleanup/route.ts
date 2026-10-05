import { NextResponse } from 'next/server'
import { verifyCronAuthorization, acquireCronLock, releaseCronLock } from '@/lib/services/cron/cron-lock.service'
import { purgeExpiredPersonalData } from '@/lib/services/privacy-retention.service'

export const dynamic = 'force-dynamic'

/**
 * Scheduled job (daily): removes marketing data that has outlived the retention periods in the
 * privacy notice (browser identifiers stored with an order after 30 days, visit records after 14 months).
 */
export async function GET(request: Request) {
  return POST(request)
}

export async function POST(request: Request) {
  const auth = verifyCronAuthorization(request)
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }

  const lock = await acquireCronLock('privacy_cleanup', 300)
  if (!lock.acquired) {
    return NextResponse.json({ success: false, message: 'Skipped: already running in another instance.', reason: lock.reason }, { status: 409 })
  }

  try {
    const result = await purgeExpiredPersonalData()
    return NextResponse.json({ success: true, job: 'privacy-cleanup', ...result, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('[cron/privacy-cleanup]', error)
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 })
  } finally {
    await releaseCronLock('privacy_cleanup')
  }
}
