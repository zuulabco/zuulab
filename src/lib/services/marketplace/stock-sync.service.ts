import 'server-only'
import type {
  MarketplaceProviderType,
  MarketplaceProductMapping,
  StockUpdateItem,
  StockUpdateResult,
} from './marketplace.interface'
import {
  getMarketplaceStores,
  getMarketplaceStoreById,
  getStoreCredentialById,
  getMarketplaceMappings,
} from './marketplace.service'
import { MarketplaceProviderFactory } from './provider.factory'
import {
  MarketplaceError,
  isRetryableMarketplaceError,
} from './marketplace-error'
import { calculateMarketplaceAvailableStock } from '../inventory.service'
import { acquireCronLock, releaseCronLock } from '../cron/cron-lock.service'
import { logAuditEvent } from '../admin.service'
import { db, isDatabaseConfigured } from '@/prisma/db'

export type StockSyncQueueStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'PROVIDER_ACCEPTED'
  | 'WAITING_FOR_RESULT'
  | 'SUCCESS'
  | 'RETRYING'
  | 'FAILED'
  | 'SKIPPED'

export interface StockSyncQueueItem {
  id: string
  storeId: string
  provider: MarketplaceProviderType
  productId: string
  sku: string
  externalSku: string
  barcode?: string | null
  desiredQuantity: number
  lastSentQuantity: number | null
  version: number
  status: StockSyncQueueStatus
  attempts: number
  maxAttempts: number
  nextRetryAt: string | null
  lastError: string | null
  batchId: string | null
  createdAt: string
  updatedAt: string
}

export interface StockDriftRecord {
  id: string
  storeId: string
  provider: MarketplaceProviderType
  productId: string
  sku: string
  externalSku: string
  centralExpected: number
  marketplaceReported: number
  driftDelta: number
  status: 'DETECTED' | 'RESOLVED' | 'ACKNOWLEDGED'
  detectedAt: string
  resolvedAt: string | null
}

// ─────────────────────────────────────────────────────────────
// IN-MEMORY STORAGE (Single source for dev/test with DB sync)
// ─────────────────────────────────────────────────────────────

const inMemoryStockSyncQueue: Map<string, StockSyncQueueItem> = new Map()
const inMemoryStockDriftRecords: Map<string, StockDriftRecord> = new Map()

/**
 * Generates composite queue key
 */
function queueKey(storeId: string, externalSku: string): string {
  return `${storeId}:${externalSku.toLowerCase().trim()}`
}

/**
 * Enqueues stock synchronization for a list of products across all active mapped channels.
 * Automatically coalesces rapid changes to the latest desired quantity and guarantees last-write safety.
 */
export async function enqueueStockSyncForProducts(
  productIds: string[]
): Promise<{ enqueuedCount: number }> {
  if (!productIds || productIds.length === 0) {
    return { enqueuedCount: 0 }
  }

  const stores = await getMarketplaceStores()
  const activeStores = new Map(
    stores.filter((s) => s.status === 'ACTIVE').map((s) => [s.id, s])
  )

  let enqueuedCount = 0
  const allMappings = await getMarketplaceMappings()

  for (const productId of productIds) {
    // Find all mappings for this product across active stores
    const productMappings = allMappings.filter(
      (m) => m.productId === productId && activeStores.has(m.storeId)
    )

    for (const mapping of productMappings) {
      const store = activeStores.get(mapping.storeId)
      if (!store) continue

      // Central calculation: single authoritative publishable stock
      const stockInfo = await calculateMarketplaceAvailableStock(productId, store.id)
      const desiredQuantity = stockInfo.publishableStock

      const key = queueKey(store.id, mapping.externalSku)
      const existing = inMemoryStockSyncQueue.get(key)
      const now = new Date().toISOString()
      const barcode = mapping.externalBarcode || mapping.productBarcode || null

      if (existing) {
        // Coalescing: If pending, retrying, failed, or waiting for result, update to new desired quantity
        if (
          existing.status === 'PENDING' ||
          existing.status === 'RETRYING' ||
          existing.status === 'FAILED' ||
          existing.status === 'PROVIDER_ACCEPTED' ||
          existing.status === 'WAITING_FOR_RESULT'
        ) {
          if (existing.desiredQuantity !== desiredQuantity) {
            existing.desiredQuantity = desiredQuantity
            existing.version += 1
            existing.status = 'PENDING'
            existing.nextRetryAt = null
            existing.barcode = barcode || existing.barcode
            existing.updatedAt = now
            inMemoryStockSyncQueue.set(key, existing)
            enqueuedCount++
          }
          continue
        } else if (existing.status === 'PROCESSING') {
          // If in flight, advance version and desired quantity so subsequent sync picks it up
          existing.desiredQuantity = desiredQuantity
          existing.version += 1
          existing.barcode = barcode || existing.barcode
          existing.updatedAt = now
          inMemoryStockSyncQueue.set(key, existing)
          enqueuedCount++
          continue
        } else if (existing.status === 'SUCCESS') {
          // If already succeeded with same quantity, no-op; if quantity differs, schedule new sync
          if (existing.lastSentQuantity === desiredQuantity) {
            continue
          }
          existing.desiredQuantity = desiredQuantity
          existing.version += 1
          existing.status = 'PENDING'
          existing.nextRetryAt = null
          existing.barcode = barcode || existing.barcode
          existing.updatedAt = now
          inMemoryStockSyncQueue.set(key, existing)
          enqueuedCount++
          continue
        }
      }

      // Create new sync item
      const newItem: StockSyncQueueItem = {
        id: `sync-job-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        storeId: store.id,
        provider: store.provider,
        productId,
        sku: mapping.productSku,
        externalSku: mapping.externalSku,
        barcode,
        desiredQuantity,
        lastSentQuantity: null,
        version: 1,
        status: 'PENDING',
        attempts: 0,
        maxAttempts: 5,
        nextRetryAt: null,
        lastError: null,
        batchId: null,
        createdAt: now,
        updatedAt: now,
      }

      inMemoryStockSyncQueue.set(key, newItem)
      enqueuedCount++

      if (isDatabaseConfigured) {
        try {
          await db.orm.public.StockSyncQueue.create({
            storeId: store.id,
            provider: store.provider,
            productId,
            sku: mapping.productSku,
            externalSku: mapping.externalSku,
            desiredQuantity,
            status: 'PENDING',
          })
        } catch (dbErr) {
          // Silently fall back to memory
        }
      }
    }
  }

  return { enqueuedCount }
}

/**
 * Processes pending and due-retrying stock sync jobs.
 * Enforces per-store distributed concurrency locks, rate-limit exponential backoff,
 * bounded batching (up to 100 items), and store-level failure isolation.
 */
/**
 * Processes pending and due-retrying stock sync jobs.
 * Enforces per-store distributed concurrency locks, rate-limit exponential backoff,
 * bounded batching, and store-level failure isolation.
 *
 * Implements 2-stage asynchronous provider lifecycle:
 * SEND -> HTTP ACCEPTED -> WAITING_FOR_RESULT (batchId) -> BATCH RESULT CHECK -> SUCCESS / RETRYING / FAILED
 */
export async function processStockSyncQueue(options: {
  storeId?: string
  batchSize?: number
  adminUserId?: string
  checkBatchResults?: boolean
} = {}): Promise<{
  processedCount: number
  successCount: number
  failedCount: number
  waitingCount: number
  resultsByStore: Record<string, { success: number; failed: number; retrying: number; waiting: number }>
}> {
  const stores = await getMarketplaceStores()
  const activeStores = stores.filter(
    (s) => s.status === 'ACTIVE' && (!options.storeId || s.id === options.storeId)
  )

  let totalProcessed = 0
  let totalSuccess = 0
  let totalFailed = 0
  let totalWaiting = 0
  const resultsByStore: Record<string, { success: number; failed: number; retrying: number; waiting: number }> = {}

  const nowTime = Date.now()
  const batchLimit = Math.min(options.batchSize || 100, 1000)
  const allMappings = await getMarketplaceMappings()

  // First: check any existing in-progress batches if polling is enabled
  if (options.checkBatchResults !== false) {
    await checkPendingBatchResults({ storeId: options.storeId })
  }

  for (const store of activeStores) {
    resultsByStore[store.id] = { success: 0, failed: 0, retrying: 0, waiting: 0 }

    // Concurrency Lock: Isolate store execution (2 min TTL)
    const lockKey = `mkt-stock-sync-${store.id}`
    const lockResult = await acquireCronLock(lockKey, 120)
    if (!lockResult.acquired) {
      continue // another runner is processing this store safely
    }

    try {
      // Find eligible jobs for this store (PENDING or due RETRYING)
      const eligibleItems = Array.from(inMemoryStockSyncQueue.values()).filter(
        (item) =>
          item.storeId === store.id &&
          (item.status === 'PENDING' ||
            (item.status === 'RETRYING' &&
              item.nextRetryAt &&
              new Date(item.nextRetryAt).getTime() <= nowTime))
      )

      if (eligibleItems.length === 0) {
        continue
      }

      // Take bounded batch
      const batch = eligibleItems.slice(0, batchLimit)
      totalProcessed += batch.length

      // Mark items as PROCESSING
      for (const item of batch) {
        item.status = 'PROCESSING'
        item.updatedAt = new Date().toISOString()
      }

      const credential = await getStoreCredentialById(store.id)
      const provider = MarketplaceProviderFactory.getProvider(store, credential || undefined)

      // Prepare StockUpdateItem array for provider contract with barcode & strict SKU identity
      const updates: StockUpdateItem[] = batch.map((item) => {
        const mapping = allMappings.find(
          (m) =>
            m.storeId === item.storeId &&
            m.externalSku.toLowerCase() === item.externalSku.toLowerCase()
        )
        const barcode =
          item.barcode ||
          mapping?.externalBarcode ||
          mapping?.productBarcode ||
          undefined

        return {
          sku: item.externalSku,
          barcode,
          stock: item.desiredQuantity,
        }
      })

      let syncResult: StockUpdateResult
      try {
        syncResult = await provider.updateStock(updates)
      } catch (err: any) {
        const isRetryable = isRetryableMarketplaceError(err)
        const errorMessage = err.message || 'Bilinmeyen sağlayıcı hatası'

        for (const item of batch) {
          item.attempts += 1
          item.lastError = errorMessage
          item.updatedAt = new Date().toISOString()

          if (isRetryable && item.attempts < item.maxAttempts) {
            // Exponential backoff with jitter: 2s, 4s, 8s, 16s...
            const delayMs = Math.min(1000 * Math.pow(2, item.attempts) + Math.random() * 500, 60000)
            item.status = 'RETRYING'
            item.nextRetryAt = new Date(Date.now() + delayMs).toISOString()
            resultsByStore[store.id].retrying++
          } else {
            // Non-retryable permanent error or max attempts exhausted
            item.status = 'FAILED'
            item.nextRetryAt = null
            resultsByStore[store.id].failed++
            totalFailed++
          }
        }

        console.warn(`[stock-sync.service] Store ${store.id} stock sync error:`, errorMessage)
        continue
      }

      // Stage 1 Acceptance: HTTP request accepted by provider -> WAITING_FOR_RESULT
      // Provider accepted is NOT yet final item success!
      const nowStr = new Date().toISOString()
      for (const item of batch) {
        // If an update occurred while processing (version was bumped), re-queue it as PENDING
        const currentInMap = inMemoryStockSyncQueue.get(queueKey(item.storeId, item.externalSku))
        if (currentInMap && currentInMap.version > item.version) {
          currentInMap.status = 'PENDING'
          currentInMap.updatedAt = nowStr
          continue
        }

        item.status = 'WAITING_FOR_RESULT'
        item.lastSentQuantity = item.desiredQuantity
        item.lastError = null
        item.batchId = syncResult.batchId || null
        item.updatedAt = nowStr
        resultsByStore[store.id].waiting++
        totalWaiting++
      }

      // Stage 2: If checkBatchResults is not disabled and batchId returned, query batch result
      if (options.checkBatchResults !== false && syncResult.batchId && provider.getBatchResult) {
        try {
          const batchRes = await provider.getBatchResult(syncResult.batchId)
          if (batchRes) {
            if (batchRes.status === 'COMPLETED') {
              for (const item of batch) {
                const currentInMap = inMemoryStockSyncQueue.get(queueKey(item.storeId, item.externalSku))
                if (currentInMap && currentInMap.version > item.version) {
                  continue
                }
                item.status = 'SUCCESS'
                item.updatedAt = new Date().toISOString()
                resultsByStore[store.id].waiting--
                resultsByStore[store.id].success++
                totalWaiting--
                totalSuccess++
              }
            } else if (batchRes.status === 'FAILED') {
              for (const item of batch) {
                item.attempts += 1
                item.lastError =
                  batchRes.failureReasons?.[0]?.reason || 'Sağlayıcı toplu işlem hatası'
                item.updatedAt = new Date().toISOString()
                resultsByStore[store.id].waiting--
                totalWaiting--

                if (item.attempts < item.maxAttempts) {
                  item.status = 'RETRYING'
                  const delayMs = Math.min(1000 * Math.pow(2, item.attempts), 60000)
                  item.nextRetryAt = new Date(Date.now() + delayMs).toISOString()
                  resultsByStore[store.id].retrying++
                } else {
                  item.status = 'FAILED'
                  item.nextRetryAt = null
                  resultsByStore[store.id].failed++
                  totalFailed++
                }
              }
            }
          }
        } catch (pollErr: any) {
          console.warn(
            `[stock-sync.service] Immediate batch result check error for ${syncResult.batchId}:`,
            pollErr.message
          )
        }
      }

      if (options.adminUserId) {
        await logAuditEvent({
          userId: options.adminUserId,
          action: 'marketplace.stock.batch_synced',
          entity: 'MarketplaceStore',
          entityId: store.id,
          metadata: {
            storeName: store.name,
            provider: store.provider,
            batchSize: batch.length,
            batchId: syncResult.batchId,
          },
        })
      }
    } catch (unexpectedErr: any) {
      console.error(`[stock-sync.service] Unexpected store sync error for ${store.id}:`, unexpectedErr)
    } finally {
      await releaseCronLock(lockKey)
    }
  }

  return {
    processedCount: totalProcessed,
    successCount: totalSuccess,
    failedCount: totalFailed,
    waitingCount: totalWaiting,
    resultsByStore,
  }
}

/**
 * Polls status for pending asynchronous batches across active stores.
 * Transitions items from WAITING_FOR_RESULT to SUCCESS, RETRYING, or FAILED.
 */
export async function checkPendingBatchResults(options: {
  storeId?: string
} = {}): Promise<{
  checkedBatchesCount: number
  completedCount: number
  failedCount: number
  inProgressCount: number
}> {
  const stores = await getMarketplaceStores()
  const activeStores = new Map(
    stores
      .filter((s) => s.status === 'ACTIVE' && (!options.storeId || s.id === options.storeId))
      .map((s) => [s.id, s])
  )

  let checkedBatchesCount = 0
  let completedCount = 0
  let failedCount = 0
  let inProgressCount = 0

  // Group waiting items by (storeId, batchId)
  const waitingBatches = new Map<
    string,
    { storeId: string; batchId: string; items: StockSyncQueueItem[] }
  >()

  for (const item of inMemoryStockSyncQueue.values()) {
    if (
      (item.status === 'WAITING_FOR_RESULT' || item.status === 'PROVIDER_ACCEPTED') &&
      item.batchId &&
      activeStores.has(item.storeId)
    ) {
      const bKey = `${item.storeId}:${item.batchId}`
      if (!waitingBatches.has(bKey)) {
        waitingBatches.set(bKey, { storeId: item.storeId, batchId: item.batchId, items: [] })
      }
      waitingBatches.get(bKey)!.items.push(item)
    }
  }

  for (const { storeId, batchId, items } of waitingBatches.values()) {
    const store = activeStores.get(storeId)
    if (!store) continue

    const credential = await getStoreCredentialById(store.id)
    const provider = MarketplaceProviderFactory.getProvider(store, credential || undefined)

    if (!provider.getBatchResult) continue
    checkedBatchesCount++

    try {
      const result = await provider.getBatchResult(batchId)
      if (!result) continue

      const nowStr = new Date().toISOString()
      if (result.status === 'COMPLETED') {
        for (const item of items) {
          const currentInMap = inMemoryStockSyncQueue.get(queueKey(item.storeId, item.externalSku))
          if (currentInMap && currentInMap.version > item.version) {
            currentInMap.status = 'PENDING'
            currentInMap.updatedAt = nowStr
            continue
          }
          item.status = 'SUCCESS'
          item.lastSentQuantity = item.desiredQuantity
          item.lastError = null
          item.updatedAt = nowStr
          completedCount++
        }
      } else if (result.status === 'FAILED') {
        for (const item of items) {
          item.attempts += 1
          item.lastError = result.failureReasons?.[0]?.reason || 'Sağlayıcı toplu işlem hatası'
          item.updatedAt = nowStr
          if (item.attempts < item.maxAttempts) {
            item.status = 'RETRYING'
            const delayMs = Math.min(1000 * Math.pow(2, item.attempts), 60000)
            item.nextRetryAt = new Date(Date.now() + delayMs).toISOString()
          } else {
            item.status = 'FAILED'
            item.nextRetryAt = null
          }
          failedCount++
        }
      } else {
        inProgressCount += items.length
      }
    } catch (err: any) {
      console.warn(`[checkPendingBatchResults] Error checking batch ${batchId}:`, err.message)
    }
  }

  return { checkedBatchesCount, completedCount, failedCount, inProgressCount }
}

/**
 * Retries all failed stock sync jobs for a store or globally.
 */
export async function retryFailedStockSyncJobs(
  storeId?: string,
  adminUserId?: string
): Promise<{ retriedCount: number }> {
  let count = 0
  const now = new Date().toISOString()

  for (const item of inMemoryStockSyncQueue.values()) {
    if (item.status === 'FAILED' && (!storeId || item.storeId === storeId)) {
      item.status = 'PENDING'
      item.attempts = 0
      item.nextRetryAt = null
      item.lastError = null
      item.updatedAt = now
      count++
    }
  }

  if (adminUserId && count > 0) {
    await logAuditEvent({
      userId: adminUserId,
      action: 'marketplace.stock.retry_failed',
      entity: 'StockSyncQueue',
      metadata: { storeId: storeId || 'ALL', retriedCount: count },
    })
  }

  return { retriedCount: count }
}

/**
 * Returns all stock sync queue items with optional filters
 */
export async function getStockSyncQueueItems(filters: {
  storeId?: string
  status?: StockSyncQueueStatus
  sku?: string
} = {}): Promise<StockSyncQueueItem[]> {
  let list = Array.from(inMemoryStockSyncQueue.values())

  if (filters.storeId) {
    list = list.filter((i) => i.storeId === filters.storeId)
  }
  if (filters.status) {
    list = list.filter((i) => i.status === filters.status)
  }
  if (filters.sku) {
    const q = filters.sku.toLowerCase().trim()
    list = list.filter(
      (i) => i.sku.toLowerCase().includes(q) || i.externalSku.toLowerCase().includes(q)
    )
  }

  return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/**
 * Returns summary metrics of current sync queue
 */
export async function getStockSyncSummary(): Promise<{
  pendingCount: number
  waitingCount: number
  retryingCount: number
  failedCount: number
  successCount: number
}> {
  let pendingCount = 0
  let waitingCount = 0
  let retryingCount = 0
  let failedCount = 0
  let successCount = 0

  for (const item of inMemoryStockSyncQueue.values()) {
    if (item.status === 'PENDING' || item.status === 'PROCESSING') pendingCount++
    else if (item.status === 'WAITING_FOR_RESULT' || item.status === 'PROVIDER_ACCEPTED') waitingCount++
    else if (item.status === 'RETRYING') retryingCount++
    else if (item.status === 'FAILED') failedCount++
    else if (item.status === 'SUCCESS') successCount++
  }

  return { pendingCount, waitingCount, retryingCount, failedCount, successCount }
}

/**
 * Reconciles stock drift between central available stock and marketplace status
 */
export async function reconcileStockDrift(storeId?: string): Promise<{
  scannedCount: number
  driftCount: number
  drifts: StockDriftRecord[]
}> {
  const stores = await getMarketplaceStores()
  const activeStores = stores.filter(
    (s) => s.status === 'ACTIVE' && (!storeId || s.id === storeId)
  )

  const allMappings = await getMarketplaceMappings()
  const drifts: StockDriftRecord[] = []
  let scannedCount = 0

  for (const store of activeStores) {
    const storeMappings = allMappings.filter((m) => m.storeId === store.id)

    for (const mapping of storeMappings) {
      scannedCount++
      const stockInfo = await calculateMarketplaceAvailableStock(mapping.productId, store.id)
      const expected = stockInfo.publishableStock

      // Compare with last sent quantity in the queue
      const qItem = inMemoryStockSyncQueue.get(queueKey(store.id, mapping.externalSku))
      const reported = qItem?.lastSentQuantity ?? -1

      // If reported differs from expected when a successful sync was supposed to have sent it
      if (reported !== -1 && reported !== expected) {
        const driftDelta = expected - reported
        const recordId = `drift-${store.id}-${mapping.externalSku}`
        const driftRecord: StockDriftRecord = {
          id: recordId,
          storeId: store.id,
          provider: store.provider,
          productId: mapping.productId,
          sku: mapping.productSku,
          externalSku: mapping.externalSku,
          centralExpected: expected,
          marketplaceReported: reported,
          driftDelta,
          status: 'DETECTED',
          detectedAt: new Date().toISOString(),
          resolvedAt: null,
        }
        inMemoryStockDriftRecords.set(recordId, driftRecord)
        drifts.push(driftRecord)
      }
    }
  }

  return {
    scannedCount,
    driftCount: drifts.length,
    drifts,
  }
}

/**
 * Returns recorded drift records
 */
export async function getStockDriftRecords(): Promise<StockDriftRecord[]> {
  return Array.from(inMemoryStockDriftRecords.values()).sort((a, b) =>
    b.detectedAt.localeCompare(a.detectedAt)
  )
}
