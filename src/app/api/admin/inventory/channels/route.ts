import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import {
  getInventoryStatus,
  calculateMarketplaceAvailableStock,
  getInventoryTransactions,
  getGlobalSafetyBuffer,
  getChannelConfigs,
} from '@/lib/services/inventory.service'
import {
  getMarketplaceStores,
  getMarketplaceMappings,
} from '@/lib/services/marketplace/marketplace.service'
import {
  getStockSyncQueueItems,
  getStockDriftRecords,
} from '@/lib/services/marketplace/stock-sync.service'
import { MOCK_PRODUCTS } from '@/lib/mock-data'

export async function GET(request: Request) {
  try {
    await requirePermission(request, 'INVENTORY_VIEW')

    const stores = await getMarketplaceStores()
    const activeStores = stores.filter((s) => s.status === 'ACTIVE')
    const allMappings = await getMarketplaceMappings()
    const allQueueItems = await getStockSyncQueueItems()
    const allDrifts = await getStockDriftRecords()
    const globalBuffer = getGlobalSafetyBuffer()
    const channelConfigs = getChannelConfigs()

    const products = []

    for (const prod of MOCK_PRODUCTS) {
      const central = await getInventoryStatus(prod.id)
      const threshold = (prod as any).lowStockThreshold || 5

      // Channel details for each active store
      const channels = []
      for (const store of activeStores) {
        const mapping = allMappings.find(
          (m) => m.productId === prod.id && m.storeId === store.id
        )

        const stockCalc = await calculateMarketplaceAvailableStock(prod.id, store.id)
        const qItem = allQueueItems.find(
          (q) => q.productId === prod.id && q.storeId === store.id
        )
        const drift = allDrifts.find(
          (d) => d.productId === prod.id && d.storeId === store.id && d.status === 'DETECTED'
        )

        channels.push({
          storeId: store.id,
          storeName: store.name,
          storeCode: store.code,
          provider: store.provider,
          isMapped: Boolean(mapping),
          externalSku: mapping?.externalSku || null,
          safetyBuffer: stockCalc.safetyBuffer,
          publishableStock: mapping ? stockCalc.publishableStock : 0,
          syncStatus: qItem?.status || 'IDLE',
          lastSentQuantity: qItem?.lastSentQuantity ?? null,
          lastError: qItem?.lastError || null,
          updatedAt: qItem?.updatedAt || null,
          hasDrift: Boolean(drift),
        })
      }

      let status = 'IN_STOCK'
      if (central.available <= 0) status = 'OUT_OF_STOCK'
      else if (central.available <= threshold) status = 'LOW_STOCK'

      products.push({
        productId: prod.id,
        productName: prod.name,
        sku: prod.sku,
        category: (prod as any).category || (prod as any).collectionWorld || 'Genel',
        physicalStock: central.stock,
        reservedStock: central.reserved,
        availableStock: central.available,
        lowStockThreshold: threshold,
        status,
        channels,
      })
    }

    const transactions = await getInventoryTransactions()

    return NextResponse.json({
      success: true,
      globalSafetyBuffer: globalBuffer,
      channelConfigs,
      products,
      transactions: transactions.slice(0, 50),
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
