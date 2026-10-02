import type { MarketplaceCredential, MarketplaceStore } from '../marketplace.interface'
import { marketplaceFetch, marketplaceHeaders } from './marketplace-http'

/**
 * Trendyol stock and price updates. Trendyol accepts the request, returns a batch
 * request id and processes it asynchronously; per-item results are read later.
 * Limits: 1000 items per request, quantity at most 20,000, listPrice >= salePrice,
 * and an identical request body is rejected for 15 minutes.
 */

export const TRENDYOL_MAX_ITEMS = 1000
export const TRENDYOL_MAX_QUANTITY = 20_000

export interface TrendyolInventoryItem {
  barcode: string
  quantity?: number
  salePrice?: number
  listPrice?: number
}

export async function sendTrendyolPriceAndInventory(
  store: MarketplaceStore,
  credential: MarketplaceCredential | undefined,
  items: TrendyolInventoryItem[]
): Promise<string> {
  const sellerId = encodeURIComponent(store.externalMerchantId)
  const res = await marketplaceFetch(
    'TRENDYOL',
    `https://apigw.trendyol.com/integration/inventory/sellers/${sellerId}/products/price-and-inventory`,
    { method: 'POST', headers: marketplaceHeaders(store, credential), body: JSON.stringify({ items }) }
  )
  const data = (await res.json().catch(() => ({}))) as { batchRequestId?: string }
  if (!data.batchRequestId) throw new Error('Trendyol isteği kabul etti ama işlem numarası (batchRequestId) dönmedi.')
  return data.batchRequestId
}

export interface TrendyolBatchResult {
  done: boolean
  /** Failure reasons per barcode; barcodes not listed succeeded. */
  failures: Map<string, string>
}

type BatchItem = {
  status?: string
  failureReasons?: Array<string | { reason?: string; message?: string }>
  requestItem?: { barcode?: string; updateRequestDate?: string }
  barcode?: string
}

export async function readTrendyolBatch(
  store: MarketplaceStore,
  credential: MarketplaceCredential | undefined,
  batchRequestId: string
): Promise<TrendyolBatchResult> {
  const sellerId = encodeURIComponent(store.externalMerchantId)
  const res = await marketplaceFetch(
    'TRENDYOL',
    `https://apigw.trendyol.com/integration/product/sellers/${sellerId}/products/batch-requests/${encodeURIComponent(batchRequestId)}`,
    { method: 'GET', headers: marketplaceHeaders(store, credential) }
  )
  const data = (await res.json().catch(() => ({}))) as { status?: string; items?: BatchItem[] }
  const status = String(data.status ?? '').toUpperCase()
  const failures = new Map<string, string>()
  for (const item of data.items ?? []) {
    if (String(item.status ?? '').toUpperCase() !== 'FAILED') continue
    const barcode = item.requestItem?.barcode ?? item.barcode
    if (!barcode) continue
    const reasons = (item.failureReasons ?? [])
      .map((r) => (typeof r === 'string' ? r : r.reason || r.message || ''))
      .filter(Boolean)
    failures.set(barcode, reasons.join('; ') || 'Trendyol güncellemeyi reddetti.')
  }
  return { done: status === 'COMPLETED' || status === 'FAILED', failures }
}
