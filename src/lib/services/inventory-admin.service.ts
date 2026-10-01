import 'server-only'
import { adminGetProductById, adminUpdateProduct } from './catalog-admin.service'
import { getInventoryStatus, recordInventoryTransaction } from './inventory.service'
import { enqueueStockSyncForProducts } from './marketplace/stock-sync.service'
import { MOCK_PRODUCTS } from '@/lib/mock-data'
import { logAuditEvent } from './admin.service'

export interface InventoryMovement {
  id: string
  productId: string
  productName: string
  previousStock: number
  newStock: number
  quantityChange: number
  movementType: 'RESTOCK' | 'MANUAL_ADJUSTMENT' | 'SALE' | 'RETURN' | 'CORRECTION'
  reason: string
  changedBy: string
  createdAt: string
}

// In-memory inventory movements log
const inventoryMovements: InventoryMovement[] = [
  {
    id: 'mov-init-1',
    productId: 'prod-1',
    productName: 'Mini Dinozor Serisi (6 Figür Set)',
    previousStock: 0,
    newStock: 35,
    quantityChange: 35,
    movementType: 'RESTOCK',
    reason: 'İlk üretim partisi',
    changedBy: 'admin@zuulab.com',
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
  },
]

/**
 * Retrieves stock breakdown for all products
 */
export async function adminGetInventoryOverview() {
  const list = []
  for (const prod of MOCK_PRODUCTS) {
    const inv = await getInventoryStatus(prod.id)
    const threshold = (prod as any).lowStockThreshold || 5
    let status = 'IN_STOCK'
    if (inv.available <= 0) status = 'OUT_OF_STOCK'
    else if (inv.available <= threshold) status = 'LOW_STOCK'

    list.push({
      productId: prod.id,
      productName: prod.name,
      sku: prod.sku,
      category: (prod as any).category || (prod as any).collectionWorld || prod.categoryId || 'genel',
      stock: inv.stock,
      reserved: inv.reserved,
      available: inv.available,
      lowStockThreshold: threshold,
      status,
    })
  }
  return list
}

/**
 * Manually adjusts inventory for a product with reasons and movement logging
 */
export async function adminAdjustStock(params: {
  productId: string
  quantityChange: number
  movementType: InventoryMovement['movementType']
  reason: string
  changedBy: string
}) {
  const prod = await adminGetProductById(params.productId)
  if (!prod) throw new Error('Stok ayarlanacak ürün bulunamadı.')

  const current = await getInventoryStatus(params.productId)
  const previousStock = current.stock
  const newStock = Math.max(0, previousStock + params.quantityChange)

  // Update in catalog
  await adminUpdateProduct(
    params.productId,
    { stock: newStock },
    params.changedBy
  )

  const movement: InventoryMovement = {
    id: `mov-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    productId: params.productId,
    productName: prod.name,
    previousStock,
    newStock,
    quantityChange: params.quantityChange,
    movementType: params.movementType,
    reason: params.reason,
    changedBy: params.changedBy,
    createdAt: new Date().toISOString(),
  }

  inventoryMovements.unshift(movement)

  await logAuditEvent({
    action: 'INVENTORY_ADJUSTED',
    entity: 'Inventory',
    entityId: params.productId,
    metadata: {
      productName: prod.name,
      previousStock,
      newStock,
      change: params.quantityChange,
      reason: params.reason,
      changedBy: params.changedBy,
    },
  })

  // Record in central transaction ledger
  await recordInventoryTransaction({
    productId: params.productId,
    sku: prod.sku,
    changeQuantity: params.quantityChange,
    previousStock,
    newStock,
    previousReserved: current.reserved,
    newReserved: current.reserved,
    type: 'MANUAL_ADJUSTMENT',
    reason: `${params.movementType}: ${params.reason}`,
    orderNumber: null,
    storeId: null,
    externalOrderId: null,
    externalLineItemId: null,
    idempotencyKey: `MANUAL_ADJ:${params.productId}:${movement.id}`,
    metadata: { changedBy: params.changedBy, movementType: params.movementType },
  })

  // Trigger marketplace sync
  enqueueStockSyncForProducts([params.productId]).catch(() => {})

  return {
    success: true,
    movement,
    newStock,
  }
}

/**
 * Retrieves inventory movements history
 */
export async function adminGetInventoryMovements(productId?: string) {
  if (productId) {
    return inventoryMovements.filter((m) => m.productId === productId)
  }
  return inventoryMovements
}
