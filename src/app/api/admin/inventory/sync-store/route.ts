import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import {
  enqueueStockSyncForProducts,
  processStockSyncQueue,
} from '@/lib/services/marketplace/stock-sync.service'
import { getMarketplaceMappings } from '@/lib/services/marketplace/marketplace.service'

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'INVENTORY_MANAGE')
    const body = await request.json()
    const { storeId } = body

    if (!storeId) {
      return NextResponse.json(
        { success: false, error: 'storeId zorunludur.' },
        { status: 400 }
      )
    }

    const mappings = await getMarketplaceMappings(storeId)
    const productIds = Array.from(new Set(mappings.map((m) => m.productId)))

    const { enqueuedCount } = await enqueueStockSyncForProducts(productIds)
    const syncResult = await processStockSyncQueue({
      storeId,
      adminUserId: user.id,
    })

    return NextResponse.json({
      success: true,
      enqueuedCount,
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
