import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import {
  retryFailedStockSyncJobs,
  processStockSyncQueue,
} from '@/lib/services/marketplace/stock-sync.service'

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'INVENTORY_MANAGE')
    const body = await request.json().catch(() => ({}))
    const { storeId } = body

    const { retriedCount } = await retryFailedStockSyncJobs(storeId, user.id)
    const syncResult = await processStockSyncQueue({
      storeId,
      adminUserId: user.id,
    })

    return NextResponse.json({
      success: true,
      retriedCount,
      syncResult,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
