import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import {
  getStockSyncQueueItems,
  getStockSyncSummary,
  getStockDriftRecords,
  reconcileStockDrift,
} from '@/lib/services/marketplace/stock-sync.service'

export async function GET(request: Request) {
  try {
    await requirePermission(request, 'INVENTORY_VIEW')

    const url = new URL(request.url)
    const storeId = url.searchParams.get('storeId') || undefined
    const status = (url.searchParams.get('status') as any) || undefined
    const sku = url.searchParams.get('sku') || undefined
    const scanDrift = url.searchParams.get('scanDrift') === 'true'

    if (scanDrift) {
      await reconcileStockDrift(storeId)
    }

    const [items, summary, drifts] = await Promise.all([
      getStockSyncQueueItems({ storeId, status, sku }),
      getStockSyncSummary(),
      getStockDriftRecords(),
    ])

    return NextResponse.json({
      success: true,
      summary,
      items,
      drifts,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
