import 'server-only'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { MOCK_PRODUCTS } from '@/lib/mock-data'
import { logAuditEvent } from './admin.service'
import { enqueueStockSyncForProducts } from './marketplace/stock-sync.service'

export type InventoryTransactionType =
  | 'DIRECT_ORDER_RESERVATION'
  | 'DIRECT_ORDER_RELEASE'
  | 'DIRECT_ORDER_COMMIT'
  | 'MARKETPLACE_ORDER_RESERVATION'
  | 'MARKETPLACE_ORDER_RELEASE'
  | 'MARKETPLACE_ORDER_COMMIT'
  | 'ORDER_CANCELLATION'
  | 'RETURN_RESTOCK'
  | 'MANUAL_ADJUSTMENT'
  | 'INITIAL_STOCK'
  | 'MARKETPLACE_RECONCILIATION'
  | 'CYCLE_COUNT_ADJUSTMENT'
  | 'PRODUCTION_STOCK'

export interface InventoryTransaction {
  id: string
  productId: string
  sku: string
  changeQuantity: number
  previousStock: number
  newStock: number
  previousReserved: number
  newReserved: number
  type: InventoryTransactionType
  reason: string | null
  orderNumber: string | null
  storeId: string | null
  externalOrderId: string | null
  externalLineItemId: string | null
  idempotencyKey: string
  metadata?: Record<string, unknown> | null
  createdAt: string
}

export interface InventoryItemState {
  productId: string
  sku: string
  stock: number // Physical stock in warehouse
  reserved: number // Reserved stock across active orders/checkouts
}

export interface ChannelStockConfig {
  storeId: string
  safetyBuffer: number
  maxAllocationPercent?: number
  maxAllocationUnits?: number
  isActive: boolean
}

// ─────────────────────────────────────────────────────────────
// CENTRAL IN-MEMORY STORAGE & MUTEX LOCKS
// ─────────────────────────────────────────────────────────────

const inMemoryInventory: Map<string, InventoryItemState> = new Map()
const inMemoryTransactions: Map<string, InventoryTransaction> = new Map()
const inMemoryIdempotencyKeys: Set<string> = new Set()

// Global & Store-specific safety buffers
let globalSafetyBuffer = 2
const inMemoryChannelConfigs: Map<string, ChannelStockConfig> = new Map([
  ['store-hb-1', { storeId: 'store-hb-1', safetyBuffer: 2, isActive: true }],
  ['store-hb-2', { storeId: 'store-hb-2', safetyBuffer: 2, isActive: true }],
  ['store-ty-1', { storeId: 'store-ty-1', safetyBuffer: 2, isActive: true }],
  ['store-ty-2', { storeId: 'store-ty-2', safetyBuffer: 2, isActive: true }],
])

// Mutex queues per product to guarantee absolute concurrency serialization
const productLocks: Map<string, Promise<unknown>> = new Map()

async function acquireProductMutex<T>(productId: string, task: () => Promise<T>): Promise<T> {
  const currentLock = productLocks.get(productId) || Promise.resolve()
  let release: () => void

  const nextLock = new Promise<void>((resolve) => {
    release = resolve
  })

  productLocks.set(productId, currentLock.then(() => nextLock))

  try {
    await currentLock
    return await task()
  } finally {
    release!()
    if (productLocks.get(productId) === nextLock) {
      productLocks.delete(productId)
    }
  }
}

// Initialize central inventory from mock products
MOCK_PRODUCTS.forEach((prod) => {
  inMemoryInventory.set(prod.id, {
    productId: prod.id,
    sku: prod.sku,
    stock: prod.stock,
    reserved: 0,
  })
})

// ─────────────────────────────────────────────────────────────
// CENTRAL INVENTORY CALCULATIONS
// ─────────────────────────────────────────────────────────────

/**
 * Retrieves the current central inventory breakdown for a product.
 * Invariant: availableStock = physicalStock - reservedStock (always >= 0).
 */
export async function getInventoryStatus(productId: string): Promise<{
  stock: number
  reserved: number
  available: number
  sku: string
}> {
  if (isDatabaseConfigured) {
    try {
      const inv = await db.orm.public.Inventory.where({ productId }).first()
      if (inv) {
        const prod = await db.orm.public.Product.where({ id: productId }).first()
        return {
          stock: inv.stock,
          reserved: inv.reserved,
          available: Math.max(0, inv.stock - inv.reserved),
          sku: prod?.sku || '',
        }
      }
    } catch (err) {
      console.warn('[inventory.service] DB fetch failed:', err)
    }
  }

  const item = inMemoryInventory.get(productId)
  if (!item) {
    // If not yet in map, find in mock products
    const prod = MOCK_PRODUCTS.find((p) => p.id === productId)
    if (prod) {
      const state: InventoryItemState = {
        productId: prod.id,
        sku: prod.sku,
        stock: prod.stock,
        reserved: 0,
      }
      inMemoryInventory.set(prod.id, state)
      return {
        stock: state.stock,
        reserved: state.reserved,
        available: Math.max(0, state.stock - state.reserved),
        sku: prod.sku,
      }
    }
    return { stock: 0, reserved: 0, available: 0, sku: '' }
  }

  return {
    stock: item.stock,
    reserved: item.reserved,
    available: Math.max(0, item.stock - item.reserved),
    sku: item.sku,
  }
}

/**
 * Central publishable stock calculator used identically across all channels.
 * Formula:
 *   available = max(0, physicalStock - reservedStock)
 *   safetyBuffer = storeBuffer ?? globalSafetyBuffer ?? 0
 *   publishableStock = max(0, available - safetyBuffer)
 */
export async function calculateMarketplaceAvailableStock(
  productId: string,
  storeId?: string
): Promise<{
  physicalStock: number
  reservedStock: number
  availableStock: number
  safetyBuffer: number
  publishableStock: number
}> {
  const current = await getInventoryStatus(productId)
  const storeConfig = storeId ? inMemoryChannelConfigs.get(storeId) : undefined
  const effectiveBuffer =
    storeConfig?.safetyBuffer !== undefined
      ? storeConfig.safetyBuffer
      : globalSafetyBuffer

  let publishable = Math.max(0, current.available - effectiveBuffer)

  // Apply store-level maximum units cap if configured
  if (
    storeConfig?.maxAllocationUnits !== undefined &&
    storeConfig.maxAllocationUnits > 0
  ) {
    publishable = Math.min(publishable, storeConfig.maxAllocationUnits)
  }

  return {
    physicalStock: current.stock,
    reservedStock: current.reserved,
    availableStock: current.available,
    safetyBuffer: effectiveBuffer,
    publishableStock: publishable,
  }
}

// ─────────────────────────────────────────────────────────────
// CENTRAL TRANSACTION / LEDGER RECORDING
// ─────────────────────────────────────────────────────────────

export async function recordInventoryTransaction(
  tx: Omit<InventoryTransaction, 'id' | 'createdAt'>
): Promise<InventoryTransaction> {
  const now = new Date().toISOString()
  const id = `tx-${Date.now()}-${Math.floor(Math.random() * 10000)}`

  const record: InventoryTransaction = {
    ...tx,
    id,
    createdAt: now,
  }

  inMemoryTransactions.set(id, record)
  inMemoryIdempotencyKeys.add(tx.idempotencyKey)

  if (isDatabaseConfigured) {
    try {
      await (db.orm.public.InventoryTransaction as any).create({
        productId: tx.productId,
        sku: tx.sku,
        changeQuantity: tx.changeQuantity,
        previousStock: tx.previousStock,
        newStock: tx.newStock,
        previousReserved: tx.previousReserved,
        newReserved: tx.newReserved,
        type: tx.type as any,
        reason: tx.reason || null,
        orderNumber: tx.orderNumber || null,
        storeId: tx.storeId || null,
        externalOrderId: tx.externalOrderId || null,
        externalLineItemId: tx.externalLineItemId || null,
        idempotencyKey: tx.idempotencyKey,
        metadata: tx.metadata ? (tx.metadata as any) : undefined,
      })
    } catch (err) {
      console.warn('[inventory.service] DB transaction log failed:', err)
    }
  }

  return record
}

export async function getInventoryTransactions(filters: {
  productId?: string
  sku?: string
  orderNumber?: string
  storeId?: string
  type?: InventoryTransactionType
} = {}): Promise<InventoryTransaction[]> {
  let list = Array.from(inMemoryTransactions.values())

  if (filters.productId) {
    list = list.filter((t) => t.productId === filters.productId)
  }
  if (filters.sku) {
    const q = filters.sku.toLowerCase()
    list = list.filter((t) => t.sku.toLowerCase().includes(q))
  }
  if (filters.orderNumber) {
    list = list.filter((t) => t.orderNumber === filters.orderNumber)
  }
  if (filters.storeId) {
    list = list.filter((t) => t.storeId === filters.storeId)
  }
  if (filters.type) {
    list = list.filter((t) => t.type === filters.type)
  }

  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

// ─────────────────────────────────────────────────────────────
// CENTRAL ATOMIC & IDEMPOTENT MUTATIONS
// ─────────────────────────────────────────────────────────────

export interface ReservationItem {
  productId: string
  quantity: number
  externalLineItemId?: string
}

export interface ReservationOptions {
  context?: 'DIRECT' | 'MARKETPLACE'
  storeId?: string
  externalOrderId?: string
  idempotencyKey?: string
  reason?: string
}

/**
 * Authoritative Central Inventory Reservation
 * Enforces:
 *  1. Idempotency at transaction/database level (no double-reserving)
 *  2. All-or-nothing atomicity across multiple line items (rollback on any shortage)
 *  3. Concurrency mutex locking per product (never negative available stock)
 *  4. Single invariant for both DIRECT checkout and MARKETPLACE orders
 *  5. Asynchronous enqueue of marketplace stock sync
 */
export async function reserveInventory(
  items: ReservationItem[],
  orderNumber?: string,
  options: ReservationOptions = {}
): Promise<{ success: boolean; error?: string; idempotent?: boolean }> {
  const context = options.context || 'DIRECT'
  const txType: InventoryTransactionType =
    context === 'MARKETPLACE'
      ? 'MARKETPLACE_ORDER_RESERVATION'
      : 'DIRECT_ORDER_RESERVATION'

  // Pre-check idempotency keys for all items
  const itemKeys = items.map((item, idx) => {
    if (options.idempotencyKey && items.length === 1) {
      return options.idempotencyKey
    }
    if (context === 'MARKETPLACE') {
      const lineId = item.externalLineItemId || `line-${idx + 1}`
      return `MARKETPLACE_RES:${options.storeId || 'store'}:${options.externalOrderId || orderNumber || 'ord'}:${lineId}`
    }
    return `DIRECT_RES:${orderNumber || 'checkout'}:${item.productId}`
  })

  // If all items already processed under their idempotency keys, safe no-op
  const allAlreadyProcessed = itemKeys.every((k) => inMemoryIdempotencyKeys.has(k))
  if (allAlreadyProcessed && items.length > 0) {
    return { success: true, idempotent: true }
  }

  // Atomically check and reserve each product under mutex lock
  const reservedItems: Array<{
    productId: string
    quantity: number
    previousStock: number
    previousReserved: number
    sku: string
    idempotencyKey: string
  }> = []

  try {
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const key = itemKeys[i]

      // If this specific line is already reserved, skip mutating it
      if (inMemoryIdempotencyKeys.has(key)) {
        continue
      }

      const resResult = await acquireProductMutex(item.productId, async () => {
        const current = await getInventoryStatus(item.productId)

        if (current.available < item.quantity) {
          const prod = MOCK_PRODUCTS.find((p) => p.id === item.productId)
          const name = prod?.name || `Ürün (#${item.productId})`
          throw new Error(
            `${name} için yeterli stok bulunmuyor. Mevcut kullanılabilir stok: ${current.available}, İstenen: ${item.quantity}`
          )
        }

        // Apply reservation to in-memory state
        let inMem = inMemoryInventory.get(item.productId)
        if (!inMem) {
          inMem = {
            productId: item.productId,
            sku: current.sku,
            stock: current.stock,
            reserved: 0,
          }
          inMemoryInventory.set(item.productId, inMem)
        }

        const prevStock = inMem.stock
        const prevReserved = inMem.reserved
        inMem.reserved += item.quantity

        // Update database if configured
        if (isDatabaseConfigured) {
          try {
            await db.orm.public.Inventory.where({ productId: item.productId }).update({
              reserved: inMem.reserved,
            })
          } catch (dbErr) {
            console.warn('[inventory.service] DB update failed:', dbErr)
          }
        }

        // Record auditable transaction
        await recordInventoryTransaction({
          productId: item.productId,
          sku: inMem.sku,
          changeQuantity: item.quantity,
          previousStock: prevStock,
          newStock: prevStock,
          previousReserved: prevReserved,
          newReserved: inMem.reserved,
          type: txType,
          reason: options.reason || (context === 'MARKETPLACE' ? 'Pazaryeri Siparişi Stok Rezervasyonu' : 'Direkt Sipariş Rezervasyonu'),
          orderNumber: orderNumber || null,
          storeId: options.storeId || null,
          externalOrderId: options.externalOrderId || null,
          externalLineItemId: item.externalLineItemId || null,
          idempotencyKey: key,
          metadata: { context, requestedQuantity: item.quantity },
        })

        return {
          productId: item.productId,
          quantity: item.quantity,
          previousStock: prevStock,
          previousReserved: prevReserved,
          sku: inMem.sku,
          idempotencyKey: key,
        }
      })

      reservedItems.push(resResult)
    }

    await logAuditEvent({
      action: 'INVENTORY_RESERVED',
      entity: 'Inventory',
      entityId: orderNumber || options.externalOrderId || 'reservation',
      metadata: {
        context,
        storeId: options.storeId,
        orderNumber,
        itemCount: reservedItems.length,
      },
    })

    // Asynchronously trigger downstream marketplace stock synchronization (outside DB transaction)
    enqueueStockSyncForProducts(items.map((i) => i.productId)).catch((err) => {
      console.warn('[inventory.service] Stock sync trigger warning:', err)
    })

    return { success: true }
  } catch (err: any) {
    // Rollback any partially reserved items in this multi-line order (all-or-nothing)
    for (const roll of reservedItems) {
      await acquireProductMutex(roll.productId, async () => {
        const inMem = inMemoryInventory.get(roll.productId)
        if (inMem) {
          inMem.reserved = Math.max(0, inMem.reserved - roll.quantity)
        }
        inMemoryIdempotencyKeys.delete(roll.idempotencyKey)

        if (isDatabaseConfigured) {
          try {
            await db.orm.public.Inventory.where({ productId: roll.productId }).update({
              reserved: inMem ? inMem.reserved : roll.previousReserved,
            })
          } catch {}
        }
      })
    }

    return {
      success: false,
      error: err.message || 'Stok rezervasyonu yapılamadı.',
    }
  }
}

/**
 * Releases reserved inventory back to available stock.
 * Enforces idempotency (repeated release will not double-release).
 */
export async function releaseInventoryReservation(
  items: ReservationItem[],
  orderNumber?: string,
  options: ReservationOptions = {}
): Promise<{ success: boolean; idempotent?: boolean }> {
  const context = options.context || 'DIRECT'
  const txType: InventoryTransactionType =
    context === 'MARKETPLACE'
      ? 'MARKETPLACE_ORDER_RELEASE'
      : 'DIRECT_ORDER_RELEASE'

  const affectedProductIds: string[] = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const lineId = item.externalLineItemId || `line-${i + 1}`
    const releaseKey =
      context === 'MARKETPLACE'
        ? `MARKETPLACE_REL:${options.storeId || 'store'}:${options.externalOrderId || orderNumber || 'ord'}:${lineId}`
        : `DIRECT_REL:${orderNumber || 'release'}:${item.productId}`

    // Idempotency: prevent double release
    if (inMemoryIdempotencyKeys.has(releaseKey)) {
      continue
    }

    await acquireProductMutex(item.productId, async () => {
      const inMem = inMemoryInventory.get(item.productId)
      if (!inMem) return

      const prevStock = inMem.stock
      const prevReserved = inMem.reserved
      inMem.reserved = Math.max(0, inMem.reserved - item.quantity)

      if (isDatabaseConfigured) {
        try {
          await db.orm.public.Inventory.where({ productId: item.productId }).update({
            reserved: inMem.reserved,
          })
        } catch (err) {
          console.warn('[inventory.service] Release DB failed:', err)
        }
      }

      await recordInventoryTransaction({
        productId: item.productId,
        sku: inMem.sku,
        changeQuantity: -item.quantity,
        previousStock: prevStock,
        newStock: prevStock,
        previousReserved: prevReserved,
        newReserved: inMem.reserved,
        type: txType,
        reason: options.reason || (context === 'MARKETPLACE' ? 'Pazaryeri Sipariş İptali Rezervasyon Serbest Bırakma' : 'Rezervasyon İptali'),
        orderNumber: orderNumber || null,
        storeId: options.storeId || null,
        externalOrderId: options.externalOrderId || null,
        externalLineItemId: item.externalLineItemId || null,
        idempotencyKey: releaseKey,
        metadata: { context, releasedQuantity: item.quantity },
      })

      affectedProductIds.push(item.productId)
    })
  }

  await logAuditEvent({
    action: 'INVENTORY_RELEASED',
    entity: 'Inventory',
    entityId: orderNumber || options.externalOrderId || 'release',
    metadata: { context, items },
  })

  // Trigger marketplace sync outside lock
  if (affectedProductIds.length > 0) {
    enqueueStockSyncForProducts(affectedProductIds).catch(() => {})
  }

  return { success: true }
}

/**
 * Commits inventory (deducting physical stock and clearing reservation).
 * Used when payment is confirmed or marketplace order reaches SHIPPED status.
 */
export async function commitInventoryReservation(
  items: ReservationItem[],
  orderNumber?: string,
  options: ReservationOptions = {}
): Promise<{ success: boolean; idempotent?: boolean }> {
  const context = options.context || 'DIRECT'
  const txType: InventoryTransactionType =
    context === 'MARKETPLACE'
      ? 'MARKETPLACE_ORDER_COMMIT'
      : 'DIRECT_ORDER_COMMIT'

  const affectedProductIds: string[] = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const lineId = item.externalLineItemId || `line-${i + 1}`
    const commitKey =
      context === 'MARKETPLACE'
        ? `MARKETPLACE_COMMIT:${options.storeId || 'store'}:${options.externalOrderId || orderNumber || 'ord'}:${lineId}`
        : `DIRECT_COMMIT:${orderNumber || 'commit'}:${item.productId}`

    if (inMemoryIdempotencyKeys.has(commitKey)) {
      continue
    }

    await acquireProductMutex(item.productId, async () => {
      const inMem = inMemoryInventory.get(item.productId)
      if (!inMem) return

      const prevStock = inMem.stock
      const prevReserved = inMem.reserved
      inMem.stock = Math.max(0, inMem.stock - item.quantity)
      inMem.reserved = Math.max(0, inMem.reserved - item.quantity)

      if (isDatabaseConfigured) {
        try {
          await db.orm.public.Inventory.where({ productId: item.productId }).update({
            stock: inMem.stock,
            reserved: inMem.reserved,
          })
        } catch (err) {
          console.warn('[inventory.service] Commit DB failed:', err)
        }
      }

      await recordInventoryTransaction({
        productId: item.productId,
        sku: inMem.sku,
        changeQuantity: -item.quantity,
        previousStock: prevStock,
        newStock: inMem.stock,
        previousReserved: prevReserved,
        newReserved: inMem.reserved,
        type: txType,
        reason: options.reason || (context === 'MARKETPLACE' ? 'Pazaryeri Siparişi Kesinleşti' : 'Direkt Sipariş Ödemesi Alındı'),
        orderNumber: orderNumber || null,
        storeId: options.storeId || null,
        externalOrderId: options.externalOrderId || null,
        externalLineItemId: item.externalLineItemId || null,
        idempotencyKey: commitKey,
        metadata: { context, committedQuantity: item.quantity },
      })

      affectedProductIds.push(item.productId)
    })
  }

  await logAuditEvent({
    action: 'INVENTORY_COMMITTED',
    entity: 'Inventory',
    entityId: orderNumber || options.externalOrderId || 'commit',
    metadata: { context, items },
  })

  if (affectedProductIds.length > 0) {
    enqueueStockSyncForProducts(affectedProductIds).catch(() => {})
  }

  return { success: true }
}

/**
 * Restocks physical inventory from an inspected return.
 * Enforces idempotency via returnNumber + productId key.
 */
export async function restockProductInventory(
  productId: string,
  quantity: number,
  returnNumber: string,
  adminUserId = 'system',
  options: { idempotencyKey?: string } = {}
): Promise<{ success: boolean; newStock: number; idempotent?: boolean }> {
  const restockKey =
    options.idempotencyKey || `RETURN_RESTOCK:${returnNumber}:${productId}`

  if (inMemoryIdempotencyKeys.has(restockKey)) {
    const current = await getInventoryStatus(productId)
    return { success: true, newStock: current.stock, idempotent: true }
  }

  return acquireProductMutex(productId, async () => {
    let inMem = inMemoryInventory.get(productId)
    if (!inMem) {
      const current = await getInventoryStatus(productId)
      inMem = {
        productId,
        sku: current.sku,
        stock: current.stock,
        reserved: current.reserved,
      }
      inMemoryInventory.set(productId, inMem)
    }

    const prevStock = inMem.stock
    const prevReserved = inMem.reserved
    inMem.stock += quantity
    const newStock = inMem.stock

    if (isDatabaseConfigured) {
      try {
        await db.orm.public.Inventory.where({ productId }).update({
          stock: newStock,
        })
      } catch (err) {
        console.warn('[inventory.service] Restock DB failed:', err)
      }
    }

    await recordInventoryTransaction({
      productId,
      sku: inMem.sku,
      changeQuantity: quantity,
      previousStock: prevStock,
      newStock,
      previousReserved: prevReserved,
      newReserved: prevReserved,
      type: 'RETURN_RESTOCK',
      reason: `İade Kabul Edildi (#${returnNumber})`,
      orderNumber: returnNumber,
      storeId: null,
      externalOrderId: null,
      externalLineItemId: null,
      idempotencyKey: restockKey,
      metadata: { returnNumber, restockedBy: adminUserId },
    })

    await logAuditEvent({
      action: 'INVENTORY_RESTOCKED_FROM_RETURN',
      entity: 'Inventory',
      entityId: productId,
      userId: adminUserId,
      metadata: { productId, quantity, returnNumber, newStock },
    })

    enqueueStockSyncForProducts([productId]).catch(() => {})

    return { success: true, newStock }
  })
}

/**
 * Initializes central inventory for a product if it has never been tracked.
 * Safe to call repeatedly — if stock already exists, the call is a no-op.
 * Used by PutawayService and CycleCountingService to seed physical goods
 * into central inventory without creating duplicate transactions.
 */
export async function initializeProductInventory(
  productId: string,
  sku: string,
  quantity: number
): Promise<void> {
  if (inMemoryInventory.has(productId)) {
    return // Already tracked — no-op
  }

  if (isDatabaseConfigured) {
    try {
      const dbInv = await db.orm.public.Inventory.where({ productId }).first()
      if (dbInv) {
        // Already in DB — sync to memory and return
        inMemoryInventory.set(productId, {
          productId,
          sku,
          stock: dbInv.stock,
          reserved: dbInv.reserved,
        })
        return
      }
    } catch {
      // DB unavailable — fall through to memory-only init
    }
  }

  inMemoryInventory.set(productId, {
    productId,
    sku,
    stock: quantity,
    reserved: 0,
  })
}

/**
 * Authoritative Central Inventory Adjustment for Cycle Counting and Manual Reconciliations.
 * Enforces mutex lock, idempotency, audit trail, and marketplace sync.
 */
export interface AdjustInventoryOptions {
  reason?: string
  adminUserId?: string
  storeId?: string | null
  referenceId?: string | null
  idempotencyKey?: string
  transactionType?: InventoryTransactionType
  metadata?: Record<string, unknown>
}

export async function adjustInventory(
  productId: string,
  quantityChange: number,
  options: AdjustInventoryOptions = {}
): Promise<{ success: boolean; previousStock: number; newStock: number; idempotent?: boolean }> {
  const adjKey =
    options.idempotencyKey ||
    `INV_ADJ:${productId}:${options.referenceId || Date.now()}:${quantityChange}`

  if (inMemoryIdempotencyKeys.has(adjKey)) {
    const current = await getInventoryStatus(productId)
    return {
      success: true,
      previousStock: current.stock,
      newStock: current.stock,
      idempotent: true,
    }
  }

  return acquireProductMutex(productId, async () => {
    if (inMemoryIdempotencyKeys.has(adjKey)) {
      const current = await getInventoryStatus(productId)
      return {
        success: true,
        previousStock: current.stock,
        newStock: current.stock,
        idempotent: true,
      }
    }

    let inMem = inMemoryInventory.get(productId)
    if (!inMem) {
      const current = await getInventoryStatus(productId)
      inMem = {
        productId,
        sku: current.sku,
        stock: current.stock,
        reserved: current.reserved,
      }
      inMemoryInventory.set(productId, inMem)
    }

    const prevStock = inMem.stock
    const prevReserved = inMem.reserved
    const computedStock = Math.max(0, prevStock + quantityChange)
    inMem.stock = computedStock

    if (isDatabaseConfigured) {
      try {
        await db.orm.public.Inventory.where({ productId }).update({
          stock: computedStock,
        })
      } catch (err) {
        console.warn('[inventory.service] adjustInventory DB failed:', err)
      }
    }

    const txType: InventoryTransactionType =
      options.transactionType ||
      (options.reason?.includes('CYCLE_COUNT') ? 'CYCLE_COUNT_ADJUSTMENT' : 'MANUAL_ADJUSTMENT')

    await recordInventoryTransaction({
      productId,
      sku: inMem.sku,
      changeQuantity: quantityChange,
      previousStock: prevStock,
      newStock: computedStock,
      previousReserved: prevReserved,
      newReserved: prevReserved,
      type: txType,
      reason: options.reason || 'Stok Düzeltme (Adjustment)',
      orderNumber: options.referenceId || null,
      storeId: options.storeId || null,
      externalOrderId: null,
      externalLineItemId: null,
      idempotencyKey: adjKey,
      metadata: {
        adminUserId: options.adminUserId || 'system',
        ...options.metadata,
      },
    })

    await logAuditEvent({
      action: 'INVENTORY_ADJUSTED',
      entity: 'Inventory',
      entityId: productId,
      userId: options.adminUserId || 'system',
      metadata: {
        productId,
        quantityChange,
        previousStock: prevStock,
        newStock: computedStock,
        reason: options.reason,
        storeId: options.storeId,
        referenceId: options.referenceId,
      },
    })

    enqueueStockSyncForProducts([productId]).catch(() => {})

    return {
      success: true,
      previousStock: prevStock,
      newStock: computedStock,
    }
  })
}

// ─────────────────────────────────────────────────────────────
// SAFETY BUFFERS & CHANNEL CONFIGURATION
// ─────────────────────────────────────────────────────────────

export function getGlobalSafetyBuffer(): number {
  return globalSafetyBuffer
}

export function setGlobalSafetyBuffer(buffer: number): void {
  globalSafetyBuffer = Math.max(0, buffer)
}

export function getChannelConfigs(): ChannelStockConfig[] {
  return Array.from(inMemoryChannelConfigs.values())
}

export function getChannelConfig(storeId: string): ChannelStockConfig {
  return (
    inMemoryChannelConfigs.get(storeId) || {
      storeId,
      safetyBuffer: globalSafetyBuffer,
      isActive: true,
    }
  )
}

export function setChannelConfig(
  storeId: string,
  config: Partial<ChannelStockConfig>
): ChannelStockConfig {
  const existing = getChannelConfig(storeId)
  const updated: ChannelStockConfig = {
    ...existing,
    ...config,
    storeId,
  }
  inMemoryChannelConfigs.set(storeId, updated)
  return updated
}
