import 'server-only'
import { db } from '@/prisma/db'
import { dbNumeric } from '@/lib/db/numeric'
import { dbTimestampToIso, toDbTimestamp } from '@/lib/db/time'
import { acquireCronLock, releaseCronLock } from '../cron/cron-lock.service'
import { logAuditEvent } from '../admin.service'
import { MarketplaceError } from './marketplace-error'
import { getMarketplaceStoreById, getMarketplaceStores, getStoreCredentialById } from './marketplace.service'
import type { MarketplaceStore } from './marketplace.interface'
import {
  readTrendyolBatch,
  sendTrendyolPriceAndInventory,
  TRENDYOL_MAX_ITEMS,
  TRENDYOL_MAX_QUANTITY,
  type TrendyolInventoryItem,
} from './providers/trendyol-inventory'

/**
 * Stock and price push to marketplaces.
 *
 * Nothing is queued: what to send is the difference between what the site wants
 * (product/variant stock, the listing's store price) and what was last sent, computed
 * from the database on every run. Only fields whose store switch is on are sent,
 * only for listings linked to a site product. The marketplace answers each request
 * asynchronously; rejected items get their error and are sent again an hour later.
 */

const ERROR_BACKOFF_MS = 60 * 60 * 1000
/** A batch still unanswered after this is considered lost and its items are resent. */
const BATCH_GIVE_UP_MS = 2 * 60 * 60 * 1000
const PENDING_BLOCK_MS = 30 * 60 * 1000

type ListingRow = {
  id: string
  storeId: string
  barcode: string
  title: string
  productId: string | null
  variantId: string | null
  ignored: boolean
  archived: boolean
  quantity: number
  salePrice: unknown
  targetSalePrice: unknown
  targetListPrice: unknown
  pushedQuantity: number | null
  pushedSalePrice: unknown
  pushedListPrice: unknown
  pushedAt: unknown
  pushBatchId: string | null
  pushError: string | null
  pushErrorAt: unknown
}

function money(value: unknown): number | null {
  return value === null || value === undefined ? null : Math.round(Number(value) * 100) / 100
}

export interface PushPlanItem {
  listingId: string
  barcode: string
  title: string
  productId: string | null
  productName: string | null
  /** As last read from the marketplace */
  marketplaceQuantity: number
  marketplaceSalePrice: number | null
  /** What the site wants on the marketplace (null: not managed by an enabled switch) */
  desiredQuantity: number | null
  desiredSalePrice: number | null
  desiredListPrice: number | null
  pushedQuantity: number | null
  pushedSalePrice: number | null
  pushedAt: string | null
  /** What this run would send; null when nothing changed or the listing is skipped */
  send: { quantity?: number; salePrice?: number; listPrice?: number } | null
  skipReason: string | null
  pushError: string | null
  warning: string | null
}

export interface PushPlan {
  storeId: string
  storeName: string
  stockSyncEnabled: boolean
  priceSyncEnabled: boolean
  items: PushPlanItem[]
  toSend: number
}

export async function buildStorePushPlan(storeId: string, now = new Date()): Promise<PushPlan> {
  const store = await getMarketplaceStoreById(storeId)
  if (!store) throw new MarketplaceError({ message: `Mağaza bulunamadı: ${storeId}`, code: 'NOT_FOUND', provider: 'TRENDYOL' })

  const listings = ((await db.orm.public.MarketplaceListing.where({ storeId, archived: false }).all()) as ListingRow[])
  const productIds = [...new Set(listings.map((l) => l.productId).filter((id): id is string => Boolean(id)))]
  const variantIds = [...new Set(listings.map((l) => l.variantId).filter((id): id is string => Boolean(id)))]
  const products = productIds.length
    ? await db.orm.public.Product.where((p) => p.id.in(productIds)).select('id', 'name', 'stock').all()
    : []
  const variants = variantIds.length
    ? await db.orm.public.ProductVariant.where((v) => v.id.in(variantIds)).select('id', 'stock').all()
    : []
  const productById = new Map(products.map((p) => [p.id, p]))
  const variantStock = new Map(variants.map((v) => [v.id, v.stock]))
  const pendingBatches = new Set(
    (await db.orm.public.MarketplacePushBatch.where({ storeId, status: 'PENDING' }).all())
      .filter((b) => now.getTime() - new Date(dbTimestampToIso(b.createdAt) ?? 0).getTime() < PENDING_BLOCK_MS)
      .map((b) => b.id)
  )

  const items = listings
    .map((l): PushPlanItem => {
      const product = l.productId ? productById.get(l.productId) : undefined
      const rawStock = l.variantId ? variantStock.get(l.variantId) : product?.stock
      const desiredQuantity =
        store.stockSyncEnabled && product && typeof rawStock === 'number'
          ? Math.min(Math.max(0, rawStock), TRENDYOL_MAX_QUANTITY)
          : null
      const target = money(l.targetSalePrice)
      const desiredSalePrice = store.priceSyncEnabled && target !== null && target > 0 ? target : null
      const desiredListPrice =
        desiredSalePrice === null ? null : Math.max(money(l.targetListPrice) ?? desiredSalePrice, desiredSalePrice)
      const pushedSalePrice = money(l.pushedSalePrice)
      const pushedListPrice = money(l.pushedListPrice)
      const errorAt = dbTimestampToIso(l.pushErrorAt)

      let skipReason: string | null = null
      if (l.ignored) skipReason = 'Yoksayıldı'
      else if (!l.productId || !product) skipReason = 'Site ürününe bağlı değil'
      else if (!store.stockSyncEnabled && !store.priceSyncEnabled) skipReason = 'Mağazada stok ve fiyat gönderimi kapalı'
      else if (l.pushBatchId && pendingBatches.has(l.pushBatchId)) skipReason = 'Önceki gönderimin sonucu bekleniyor'
      else if (l.pushError && errorAt && now.getTime() - new Date(errorAt).getTime() < ERROR_BACKOFF_MS) {
        skipReason = 'Son gönderim reddedildi; bir saat sonra tekrar denenecek'
      }

      let send: PushPlanItem['send'] = null
      if (!skipReason) {
        const next: NonNullable<PushPlanItem['send']> = {}
        if (desiredQuantity !== null && desiredQuantity !== l.pushedQuantity) next.quantity = desiredQuantity
        if (desiredSalePrice !== null && (desiredSalePrice !== pushedSalePrice || desiredListPrice !== pushedListPrice)) {
          next.salePrice = desiredSalePrice
          next.listPrice = desiredListPrice!
        }
        send = Object.keys(next).length ? next : null
      }

      const warning =
        send?.quantity === 0 && l.quantity > 0
          ? `Pazaryerinde ${l.quantity} adet görünüyor, 0 gönderilecek: ürün satıştan düşer. Sitede stok girildi mi?`
          : null

      return {
        listingId: l.id,
        barcode: l.barcode,
        title: l.title,
        productId: l.productId,
        productName: product?.name ?? null,
        marketplaceQuantity: l.quantity,
        marketplaceSalePrice: money(l.salePrice),
        desiredQuantity,
        desiredSalePrice,
        desiredListPrice,
        pushedQuantity: l.pushedQuantity,
        pushedSalePrice,
        pushedAt: dbTimestampToIso(l.pushedAt),
        send,
        skipReason,
        pushError: l.pushError,
        warning,
      }
    })
    .sort((a, b) => Number(Boolean(b.send)) - Number(Boolean(a.send)) || a.title.localeCompare(b.title, 'tr'))

  return {
    storeId: store.id,
    storeName: store.name,
    stockSyncEnabled: store.stockSyncEnabled,
    priceSyncEnabled: store.priceSyncEnabled,
    items,
    toSend: items.filter((i) => i.send).length,
  }
}

export interface PushResult {
  storeId: string
  storeName: string
  status: 'SENT' | 'NOTHING_TO_SEND' | 'SKIPPED' | 'FAILED'
  sent: number
  batches: number
  errorMessage?: string
}

export async function pushStoreListings(storeId: string, options: { adminUserId?: string } = {}): Promise<PushResult> {
  const store = await getMarketplaceStoreById(storeId)
  if (!store) throw new MarketplaceError({ message: `Mağaza bulunamadı: ${storeId}`, code: 'NOT_FOUND', provider: 'TRENDYOL' })
  const base = { storeId: store.id, storeName: store.name, sent: 0, batches: 0 }
  if (store.provider !== 'TRENDYOL') return { ...base, status: 'SKIPPED', errorMessage: `${store.provider} için gönderim henüz yok.` }
  if (store.status !== 'ACTIVE') return { ...base, status: 'SKIPPED', errorMessage: 'Mağaza pasif.' }
  if (!store.stockSyncEnabled && !store.priceSyncEnabled) return { ...base, status: 'SKIPPED', errorMessage: 'Stok ve fiyat gönderimi kapalı.' }

  const lockKey = `marketplace-push:${store.id}`
  const lock = await acquireCronLock(lockKey, 300)
  if (!lock.acquired) return { ...base, status: 'SKIPPED', errorMessage: 'Bu mağaza için gönderim zaten çalışıyor.' }

  try {
    await checkPushBatches(store.id)
    const plan = await buildStorePushPlan(store.id)
    const toSend = plan.items.filter((i) => i.send)
    if (toSend.length === 0) return { ...base, status: 'NOTHING_TO_SEND' }

    const credential = await getStoreCredentialById(store.id)
    let sent = 0
    let batches = 0
    for (let start = 0; start < toSend.length; start += TRENDYOL_MAX_ITEMS) {
      const chunk = toSend.slice(start, start + TRENDYOL_MAX_ITEMS)
      const payload: TrendyolInventoryItem[] = chunk.map((i) => ({ barcode: i.barcode, ...i.send! }))
      const batchRequestId = await sendTrendyolPriceAndInventory(store, credential ?? undefined, payload)
      const batch = await db.orm.public.MarketplacePushBatch.create({
        storeId: store.id,
        batchRequestId,
        items: chunk.map((i) => ({ listingId: i.listingId, barcode: i.barcode, ...i.send! })) as never,
        status: 'PENDING',
      } as never)
      const batchId = (batch as { id: string }).id
      const now = toDbTimestamp()
      for (const item of chunk) {
        await db.orm.public.MarketplaceListing.where({ id: item.listingId }).update({
          ...(item.send!.quantity !== undefined ? { pushedQuantity: item.send!.quantity } : {}),
          ...(item.send!.salePrice !== undefined
            ? { pushedSalePrice: dbNumeric(item.send!.salePrice), pushedListPrice: dbNumeric(item.send!.listPrice!) }
            : {}),
          pushedAt: now,
          pushBatchId: batchId,
          pushError: null,
          pushErrorAt: null,
        } as never)
      }
      sent += chunk.length
      batches++
    }

    await db.orm.public.MarketplaceStore.where({ id: store.id }).update({ lastPushAt: toDbTimestamp() } as never)
    await logAuditEvent({
      userId: options.adminUserId,
      action: 'marketplace.listings.pushed',
      entity: 'MarketplaceStore',
      entityId: store.id,
      metadata: { sent, batches, stock: store.stockSyncEnabled, price: store.priceSyncEnabled },
    })
    return { ...base, status: 'SENT', sent, batches }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await db.orm.public.MarketplaceStore.where({ id: store.id }).update({ lastError: `Gönderim: ${message}`.slice(0, 1000) } as never)
    console.error(JSON.stringify({ event: 'marketplace.push.failed', store: store.id, error: message }))
    return { ...base, status: 'FAILED', errorMessage: message }
  } finally {
    await releaseCronLock(lockKey)
  }
}

/**
 * Reads the marketplace's verdict on sent batches. Rejected items get their reason
 * and lose their "last sent" value, so they are sent again after the back-off.
 */
export async function checkPushBatches(storeId?: string, now = new Date()): Promise<{ checked: number; failedItems: number }> {
  let batches = await db.orm.public.MarketplacePushBatch.where({ status: 'PENDING' }).all()
  if (storeId) batches = batches.filter((b) => b.storeId === storeId)
  let checked = 0
  let failedItems = 0
  const stores = new Map<string, MarketplaceStore | null>()

  for (const batch of batches) {
    if (!stores.has(batch.storeId)) stores.set(batch.storeId, await getMarketplaceStoreById(batch.storeId))
    const store = stores.get(batch.storeId)
    if (!store) continue
    const items = (Array.isArray(batch.items) ? batch.items : []) as Array<{ listingId: string; barcode: string }>
    const age = now.getTime() - new Date(dbTimestampToIso(batch.createdAt) ?? now).getTime()

    let failures: Map<string, string>
    let done: boolean
    try {
      const credential = await getStoreCredentialById(store.id)
      ;({ done, failures } = await readTrendyolBatch(store, credential ?? undefined, batch.batchRequestId))
    } catch (err) {
      console.error(JSON.stringify({ event: 'marketplace.push.check_failed', batch: batch.id, error: (err as Error).message }))
      continue
    }
    if (!done && age < BATCH_GIVE_UP_MS) continue
    if (!done) {
      // Never answered: treat every item as not delivered.
      failures = new Map(items.map((i) => [i.barcode, 'Pazaryeri bu gönderime yanıt vermedi.']))
    }

    for (const item of items) {
      const reason = failures.get(item.barcode)
      if (!reason) continue
      // Only undo if no newer push has replaced this one.
      await db.runtime().execute(
        db.raw.sql`UPDATE marketplace_listings
          SET push_error = ${reason.slice(0, 1000)}, push_error_at = now(),
              pushed_quantity = NULL, pushed_sale_price = NULL, pushed_list_price = NULL, updated_at = now()
          WHERE id = ${item.listingId} AND push_batch_id = ${batch.id}`
          .affectedCount()
          .build()
      )
      failedItems++
    }
    const failedCount = items.filter((i) => failures.has(i.barcode)).length
    await db.orm.public.MarketplacePushBatch.where({ id: batch.id }).update({
      status: failedCount === 0 ? 'COMPLETED' : failedCount === items.length ? 'FAILED' : 'PARTIAL',
      failedCount,
      checkedAt: toDbTimestamp(now),
    } as never)
    checked++
  }
  return { checked, failedItems }
}

/** Cron entry: every active Trendyol store with a switch on. */
export async function pushAllStores(): Promise<PushResult[]> {
  const stores = (await getMarketplaceStores()).filter(
    (s) => s.provider === 'TRENDYOL' && s.status === 'ACTIVE' && s.hasCredentials && (s.stockSyncEnabled || s.priceSyncEnabled)
  )
  const results: PushResult[] = []
  for (const store of stores) results.push(await pushStoreListings(store.id))
  return results
}
