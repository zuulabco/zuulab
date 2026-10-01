import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import {
  enqueueStockSyncForProducts,
  processStockSyncQueue,
} from '@/lib/services/marketplace/stock-sync.service'

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'INVENTORY_MANAGE')
    const body = await request.json()
    const { productId } = body

    if (!productId) {
      return NextResponse.json(
        { success: false, error: 'productId zorunludur.' },
        { status: 400 }
      )
    }

    const { enqueuedCount } = await enqueueStockSyncForProducts([productId])
    const syncResult = await processStockSyncQueue({ adminUserId: user.id })

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
