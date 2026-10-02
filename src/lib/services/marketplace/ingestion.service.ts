import 'server-only'
import crypto from 'crypto'
import type { MarketplaceProviderType, MarketplaceSyncStatus } from './marketplace.interface'
import { getMarketplaceStoreById } from './marketplace.service'
import { MarketplaceError } from './marketplace-error'
import {
  syncAllMarketplaceOrders,
  syncStoreMarketplaceOrders,
  type OrderSyncResult,
} from './marketplace-orders.service'

/**
 * Entry points used by the admin "sync now" button, the cron route and marketplace
 * webhooks. The work itself is in marketplace-orders.service.
 */

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

function toIngestionResult(r: OrderSyncResult): IngestionSyncResult {
  return {
    jobId: `${r.storeId}:${r.startedAt}`,
    storeId: r.storeId,
    storeName: r.storeName,
    provider: r.provider,
    status: r.status === 'SKIPPED' ? 'PENDING' : r.status,
    recordsRead: r.packagesRead,
    recordsCreated: r.ordersCreated,
    recordsUpdated: r.ordersUpdated,
    recordsUnchanged: Math.max(0, r.packagesRead - r.ordersCreated - r.ordersUpdated - r.pending - r.failed),
    unmatched: r.pending,
    recordsFailed: r.failed,
    errorMessage: r.errorMessage ?? null,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
  }
}

export async function syncStoreOrders(
  storeId: string,
  options: { manual?: boolean; adminUserId?: string } = {}
): Promise<IngestionSyncResult> {
  return toIngestionResult(await syncStoreMarketplaceOrders(storeId, { adminUserId: options.adminUserId }))
}

export async function syncAllActiveStores(
  options: { manual?: boolean; adminUserId?: string } = {}
): Promise<IngestionSyncResult[]> {
  return (await syncAllMarketplaceOrders({ adminUserId: options.adminUserId })).map(toIngestionResult)
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
 * An authenticated webhook is only a signal that something changed: the store's
 * orders are read again from the marketplace API, so the payload itself is never
 * trusted as order data and repeated deliveries are harmless.
 */
export async function processIncomingWebhook(
  provider: MarketplaceProviderType,
  storeId: string,
  headers: Headers,
  body: Record<string, unknown>
): Promise<{
  success: boolean
  action: 'PROCESSED' | 'IGNORED_DUPLICATE'
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

  if (!isMarketplaceWebhookAuthentic(provider, headers)) {
    throw new MarketplaceError({
      message: `Unauthorized: ${provider} webhook credential missing or invalid.`,
      code: 'AUTHENTICATION_ERROR',
      provider,
      statusCode: 401,
    })
  }

  const result = await syncStoreMarketplaceOrders(store.id)
  return {
    success: result.status !== 'FAILED',
    // A sync already running for the store covers this delivery.
    action: result.status === 'SKIPPED' ? 'IGNORED_DUPLICATE' : 'PROCESSED',
    externalOrderId: String(body.orderNumber ?? body.shipmentPackageId ?? ''),
    error: result.errorMessage ?? undefined,
  }
}
