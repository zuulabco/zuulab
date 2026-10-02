import 'server-only'
import crypto from 'crypto'
import type {
  MarketplaceProviderType,
  MarketplaceSyncStrategy,
  MarketplaceSyncStatus,
  MarketplaceOrder,
  MarketplaceSyncJob,
  OrderReconciliationStatus,
} from './marketplace.interface'
import {
  getMarketplaceStoreById,
  getMarketplaceStores,
  getStoreCredentialById,
  createSyncJob,
  updateSyncJob,
  updateStoreSyncCheckpoint,
  ingestMarketplaceOrder,
  recordWebhookEvent,
  isDuplicateWebhook,
} from './marketplace.service'
import { MarketplaceProviderFactory } from './provider.factory'
import {
  MarketplaceError,
  executeWithRetryAndBackoff,
} from './marketplace-error'
import { acquireCronLock, releaseCronLock } from '../cron/cron-lock.service'
import { logAuditEvent } from '../admin.service'
import { MOCK_PRODUCTS } from '@/lib/mock-data'

export interface IngestionSyncResult {
  jobId: string
  storeId: string
  storeName: string
  provider: MarketplaceProviderType
  status: MarketplaceSyncStatus
  recordsRead: number
  recordsCreated: number
  recordsUpdated: number
  recordsUnchanged: number
  unmatched: number
  recordsFailed: number
  errorMessage?: string | null
  startedAt: string
  finishedAt: string
}

/**
 * Synchronizes orders for a specific marketplace store with concurrency protection,
 * rate limit exponential backoff, status normalization, and reconciliation.
 */
export async function syncStoreOrders(
  storeId: string,
  options: {
    manual?: boolean
    adminUserId?: string
    windowMinutes?: number
    samplePayloads?: any[]
  } = {}
): Promise<IngestionSyncResult> {
  const store = await getMarketplaceStoreById(storeId)
  if (!store) {
    throw new MarketplaceError({
      message: `Mağaza bulunamadı: ${storeId}`,
      code: 'NOT_FOUND',
      provider: 'HEPSIBURADA',
    })
  }

  if (!options.samplePayloads || options.samplePayloads.length === 0) {
    throw new MarketplaceError({
      message: 'Pazaryeri sipariş içe aktarımı henüz etkin değil.',
      code: 'NOT_IMPLEMENTED',
      provider: store.provider,
      isRetryable: false,
    })
  }

  // Concurrency Protection: Acquire store-specific distributed lease lock (5 minutes TTL)
  const lockKey = `mkt-sync-${store.id}`
  const lockResult = await acquireCronLock(lockKey, 300)
  if (!lockResult.acquired) {
    throw new MarketplaceError({
      message: `Bu mağaza (${store.name}) şu anda başka bir senkronizasyon işlemi tarafından kilitli. Lütfen birkaç dakika sonra tekrar deneyin.`,
      code: 'TEMPORARY_ERROR',
      provider: store.provider,
    })
  }

  const credential = await getStoreCredentialById(store.id)
  const provider = MarketplaceProviderFactory.getProvider(store, credential || undefined)
  const syncJob = await createSyncJob(store.id, 'ORDERS', provider.syncStrategy)

  const startedAt = new Date().toISOString()
  let recordsRead = 0
  let recordsCreated = 0
  let recordsUpdated = 0
  let recordsUnchanged = 0
  let unmatched = 0
  let recordsFailed = 0
  let errorMessage: string | null = null

  try {
    // Determine time window checkpoints to avoid hitting 10,000 package limit
    const now = new Date()
    const windowStart = store.lastSyncCheckpoint || new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    const windowEnd = now.toISOString()

    const rawOrders: any[] = options.samplePayloads

    recordsRead = rawOrders.length

    // Ingest each order with rate limit backoff safety
    for (const rawOrder of rawOrders) {
      try {
        const ingestResult = await executeWithRetryAndBackoff(
          async () => ingestMarketplaceOrder(store.id, rawOrder),
          store.provider,
          { maxRetries: 3, initialDelayMs: 20, maxDelayMs: 200 }
        )

        if (ingestResult.action === 'CREATED') {
          recordsCreated++
        } else if (ingestResult.action === 'UPDATED') {
          recordsUpdated++
        } else {
          recordsUnchanged++
        }

        if (
          ingestResult.reconciliationStatus === 'UNMATCHED' ||
          ingestResult.reconciliationStatus === 'PARTIALLY_MATCHED'
        ) {
          unmatched++
        }
      } catch (err: any) {
        recordsFailed++
        console.warn(`[ingestion.service] Failed to ingest order for ${store.id}:`, err.message)
      }
    }

    const finishedAt = new Date().toISOString()
    const jobStatus: MarketplaceSyncStatus = recordsFailed > 0 ? 'PARTIAL' : 'SUCCESS'

    await updateSyncJob(syncJob.id, {
      status: jobStatus,
      recordsRead,
      recordsCreated,
      recordsUpdated,
      recordsSkipped: recordsUnchanged,
      recordsFailed,
      unmatched,
      unchanged: recordsUnchanged,
      finishedAt,
    })

    await updateStoreSyncCheckpoint(store.id, {
      lastSuccessfulSync: finishedAt,
      lastAttemptedSync: finishedAt,
      lastSyncCheckpoint: windowEnd,
      lastError: null,
    })

    if (options.manual && options.adminUserId) {
      await logAuditEvent({
        userId: options.adminUserId,
        action: 'marketplace.order.manual_sync',
        entity: 'MarketplaceStore',
        entityId: store.id,
        metadata: {
          storeName: store.name,
          provider: store.provider,
          recordsRead,
          recordsCreated,
          recordsUpdated,
          unmatched,
        },
      })
    }

    return {
      jobId: syncJob.id,
      storeId: store.id,
      storeName: store.name,
      provider: store.provider,
      status: jobStatus,
      recordsRead,
      recordsCreated,
      recordsUpdated,
      recordsUnchanged,
      unmatched,
      recordsFailed,
      startedAt,
      finishedAt,
    }
  } catch (err: any) {
    errorMessage = err.message || 'Senkronizasyon sırasında beklenmeyen hata oluştu.'
    const finishedAt = new Date().toISOString()

    await updateSyncJob(syncJob.id, {
      status: 'FAILED',
      errorMessage,
      finishedAt,
    })

    await updateStoreSyncCheckpoint(store.id, {
      lastAttemptedSync: finishedAt,
      lastError: errorMessage,
    })

    throw err
  } finally {
    // Release the lease lock unconditionally
    await releaseCronLock(lockKey)
  }
}

/**
 * Synchronizes all active marketplace stores sequentially (preventing thundering herd).
 */
export async function syncAllActiveStores(options: {
  manual?: boolean
  adminUserId?: string
} = {}): Promise<IngestionSyncResult[]> {
  const stores = await getMarketplaceStores()
  const activeStores = stores.filter((s) => s.status === 'ACTIVE' && s.orderImportEnabled)

  const results: IngestionSyncResult[] = []

  for (const store of activeStores) {
    try {
      const res = await syncStoreOrders(store.id, options)
      results.push(res)
    } catch (err: any) {
      results.push({
        jobId: `failed-${store.id}`,
        storeId: store.id,
        storeName: store.name,
        provider: store.provider,
        status: 'FAILED',
        recordsRead: 0,
        recordsCreated: 0,
        recordsUpdated: 0,
        recordsUnchanged: 0,
        unmatched: 0,
        recordsFailed: 1,
        errorMessage: err.message,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      })
    }
  }

  return results
}

/**
 * Compares the credential a marketplace sends with `<PROVIDER>_WEBHOOK_SECRET`
 * (e.g. TRENDYOL_WEBHOOK_SECRET). Accepted carriers: `x-api-key`/`apikey`, or the
 * Authorization header as `Bearer <secret>`, `Basic <secret>` or the raw value.
 * Production rejects every request when the secret is not configured.
 */
function isMarketplaceWebhookAuthentic(provider: MarketplaceProviderType, headers: Headers): boolean {
  const secret = process.env[`${provider}_WEBHOOK_SECRET`]
  if (!secret) {
    return process.env.NODE_ENV !== 'production'
  }

  const authHeader = (headers.get('authorization') || '').trim()
  const candidates = [
    headers.get('x-api-key'),
    headers.get('apikey'),
    authHeader,
    authHeader.replace(/^(Bearer|Basic)\s+/i, ''),
  ].filter((v): v is string => Boolean(v))

  const expected = Buffer.from(secret)
  return candidates.some((value) => {
    const provided = Buffer.from(value)
    return provided.length === expected.length && crypto.timingSafeEqual(provided, expected)
  })
}

/**
 * Handles incoming marketplace webhooks with signature/credential authentication
 * and deduplication idempotency.
 */
export async function processIncomingWebhook(
  provider: MarketplaceProviderType,
  storeId: string,
  headers: Headers,
  body: any
): Promise<{
  success: boolean
  action: 'PROCESSED' | 'IGNORED_DUPLICATE'
  orderId?: string
  externalOrderId?: string
  error?: string
}> {
  const store = await getMarketplaceStoreById(storeId)
  if (!store || store.provider !== provider) {
    throw new MarketplaceError({
      message: `Mağaza bulunamadı veya sağlayıcı eşleşmiyor: ${storeId}`,
      code: 'NOT_FOUND',
      provider,
    })
  }

  // Webhook authentication. Trendyol and Hepsiburada echo back the credential
  // registered with the webhook (API key header or Basic/Bearer Authorization), so
  // the value itself must match; header presence alone proves nothing.
  if (!isMarketplaceWebhookAuthentic(provider, headers)) {
    throw new MarketplaceError({
      message: `Unauthorized: ${provider} webhook credential missing or invalid.`,
      code: 'AUTHENTICATION_ERROR',
      provider,
      statusCode: 401,
    })
  }

  // Webhook Idempotency Check
  const eventId = String(body.eventId || body.id || body.packageNumber || body.orderNumber || Date.now())
  const eventStatus = String(body.status || body.eventType || 'STATUS_UPDATE')
  const dedupKey = `wh_${provider}_${store.id}_${eventId}_${eventStatus}`

  if (isDuplicateWebhook(dedupKey)) {
    return {
      success: true,
      action: 'IGNORED_DUPLICATE',
      externalOrderId: String(body.orderNumber || body.shipmentPackageId || ''),
    }
  }

  // Record webhook audit log event
  const webhookRecordId = `whevt-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  await recordWebhookEvent({
    id: webhookRecordId,
    provider,
    storeId: store.id,
    eventType: eventStatus,
    externalOrderId: body.orderNumber || body.shipmentPackageId || undefined,
    packageNumber: body.packageNumber || body.shipmentPackageId || undefined,
    status: eventStatus,
    payload: body,
    processed: true,
    createdAt: new Date().toISOString(),
  })

  // Ingest normalized order payload
  const ingestResult = await ingestMarketplaceOrder(store.id, body)

  return {
    success: true,
    action: 'PROCESSED',
    orderId: ingestResult.order.id,
    externalOrderId: ingestResult.order.externalOrderId,
  }
}
