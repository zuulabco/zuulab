import { NextResponse } from 'next/server'
import {
  verifyCronAuthorization,
  acquireCronLock,
  releaseCronLock,
} from '@/lib/services/cron/cron-lock.service'
import { syncAllActiveStores } from '@/lib/services/marketplace/ingestion.service'
import { pushAllStores } from '@/lib/services/marketplace/listing-push.service'

export async function GET(request: Request) {
  return handleCron(request)
}

export async function POST(request: Request) {
  return handleCron(request)
}

async function handleCron(request: Request) {
  const auth = verifyCronAuthorization(request)
  if (!auth.authorized) {
    return NextResponse.json(
      { success: false, error: auth.error || 'Unauthorized' },
      { status: auth.status }
    )
  }

  const lockKey = 'cron-marketplace-orders-sync'
  const lock = await acquireCronLock(lockKey, 300)
  if (!lock.acquired) {
    return NextResponse.json({
      success: true,
      message: 'Marketplace orders sync cron is already running on another instance.',
      skipped: true,
    })
  }

  try {
    // Orders first (they move stock), then send stock/prices to stores whose switches are on.
    const results = await syncAllActiveStores({ manual: false })
    const pushes = await pushAllStores()

    const totalRead = results.reduce((acc, r) => acc + r.recordsRead, 0)
    const totalCreated = results.reduce((acc, r) => acc + r.recordsCreated, 0)
    const totalUpdated = results.reduce((acc, r) => acc + r.recordsUpdated, 0)
    const totalUnmatched = results.reduce((acc, r) => acc + r.unmatched, 0)

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        storesSynced: results.length,
        totalRead,
        totalCreated,
        totalUpdated,
        totalUnmatched,
        pushed: pushes.reduce((acc, p) => acc + p.sent, 0),
        pushFailures: pushes.filter((p) => p.status === 'FAILED').length,
      },
      results,
      pushes,
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Marketplace orders sync cron failed.',
      },
      { status: 500 }
    )
  } finally {
    await releaseCronLock(lockKey)
  }
}
