import { NextResponse } from 'next/server'
import { verifyCronAuthorization, acquireCronLock, releaseCronLock } from '@/lib/services/cron/cron-lock.service'
import { runAutomations } from '@/lib/services/email-automation.service'

export const dynamic = 'force-dynamic'

/**
 * Scheduled job: runs the active e-mail automations once (unpaid-order reminder, review request).
 * Safe to call as often as you like: a rule never mails the same order twice, an address gets at
 * most one automatic mail every 3 days, nothing goes out between 21:00 and 09:00 Turkish time, and
 * automations that are switched off in the admin do nothing. Calling it every 30 minutes keeps the
 * "3 hours later" reminder on time; the daily Vercel run is the fallback.
 */
export async function GET(request: Request) {
  return POST(request)
}

export async function POST(request: Request) {
  const auth = verifyCronAuthorization(request)
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }

  const lock = await acquireCronLock('email_automations', 240)
  if (!lock.acquired) {
    return NextResponse.json({ success: false, message: 'Skipped: already running in another instance.', reason: lock.reason }, { status: 409 })
  }

  try {
    const results = await runAutomations()
    return NextResponse.json({ success: true, job: 'email-automations', results, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('[cron/email-automations]', error)
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 })
  } finally {
    await releaseCronLock('email_automations')
  }
}
