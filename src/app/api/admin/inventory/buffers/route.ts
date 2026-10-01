import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import {
  getGlobalSafetyBuffer,
  setGlobalSafetyBuffer,
  getChannelConfig,
  setChannelConfig,
  getChannelConfigs,
} from '@/lib/services/inventory.service'
import { enqueueStockSyncForProducts } from '@/lib/services/marketplace/stock-sync.service'
import { MOCK_PRODUCTS } from '@/lib/mock-data'
import { logAuditEvent } from '@/lib/services/admin.service'

export async function GET(request: Request) {
  try {
    await requirePermission(request, 'INVENTORY_VIEW')

    return NextResponse.json({
      success: true,
      globalSafetyBuffer: getGlobalSafetyBuffer(),
      channelConfigs: getChannelConfigs(),
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'INVENTORY_MANAGE')
    const body = await request.json()
    const { storeId, safetyBuffer, maxAllocationPercent, maxAllocationUnits, isGlobal } = body

    if (isGlobal || !storeId) {
      if (typeof safetyBuffer === 'number') {
        setGlobalSafetyBuffer(safetyBuffer)
      }
    } else {
      setChannelConfig(storeId, {
        safetyBuffer: typeof safetyBuffer === 'number' ? safetyBuffer : undefined,
        maxAllocationPercent,
        maxAllocationUnits,
        isActive: true,
      })
    }

    await logAuditEvent({
      userId: user.id,
      action: 'marketplace.stock.buffer_updated',
      entity: 'StockChannelConfig',
      entityId: storeId || 'GLOBAL',
      metadata: { safetyBuffer, maxAllocationPercent, maxAllocationUnits, isGlobal },
    })

    // Re-evaluate publishable stock across all products
    const productIds = MOCK_PRODUCTS.map((p) => p.id)
    await enqueueStockSyncForProducts(productIds)

    return NextResponse.json({
      success: true,
      globalSafetyBuffer: getGlobalSafetyBuffer(),
      channelConfigs: getChannelConfigs(),
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
