import { NextResponse } from 'next/server'
import {
  verifyCronAuthorization,
  acquireCronLock,
  releaseCronLock,
} from '@/lib/services/cron/cron-lock.service'
import { reconcileStockDrift } from '@/lib/services/marketplace/stock-sync.service'

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

  const lockKey = 'cron-inventory-drift-reconciliation'
  const lock = await acquireCronLock(lockKey, 300)
  if (!lock.acquired) {
    return NextResponse.json({
      success: true,
      message: 'Inventory drift reconciliation cron is already running on another instance.',
      skipped: true,
    })
  }

  try {
    const result = await reconcileStockDrift()

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: result,
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Inventory drift reconciliation cron failed.',
      },
      { status: 500 }
    )
  } finally {
    await releaseCronLock(lockKey)
  }
}
