import 'server-only'
import type {
  MarketplaceStore,
  MarketplaceCredential,
  MarketplaceProductMapping,
  MarketplaceOrder,
  MarketplaceOrderItem,
  MarketplaceSyncJob,
  MarketplaceProviderType,
  MarketplaceStoreStatus,
  MarketplaceEnvironment,
  NormalizedMarketplaceStatus,
  ConnectionTestResult,
  MarketplaceWebhookEvent,
  OrderReconciliationStatus,
  ItemStockStatus,
  MarketplaceOrderSnapshot,
  MarketplaceSyncStrategy,
} from './marketplace.interface'
import { MarketplaceProviderFactory } from './provider.factory'
import { MarketplaceError } from './marketplace-error'
import { logAuditEvent } from '../admin.service'
import { db } from '@/prisma/db'
import { dbNumeric } from '@/lib/db/numeric'
import { dbTimestampToIso, toDbTimestamp } from '@/lib/db/time'
import { isSecretBoxConfigured, openSecret, sealSecret } from '@/lib/security/secret-box'
import {
  reserveInventory,
  releaseInventoryReservation,
  commitInventoryReservation,
  getInventoryStatus,
} from '../inventory.service'

// ─────────────────────────────────────────────────────────────
// IN-MEMORY STATE (mappings, orders, jobs move to the database in the next steps)
// ─────────────────────────────────────────────────────────────

const inMemoryOrders: Map<string, MarketplaceOrder> = new Map()
const inMemorySyncJobs: Map<string, MarketplaceSyncJob> = new Map()

// ─────────────────────────────────────────────────────────────
// STORE MANAGEMENT SERVICES (marketplace_stores / marketplace_credentials)
// ─────────────────────────────────────────────────────────────

export const SUPPORTED_MARKETPLACES = ['TRENDYOL', 'HEPSIBURADA'] as const

export interface CreateStoreInput {
  provider: MarketplaceProviderType
  name: string
  code?: string
  displayName?: string
  externalMerchantId: string
  environment?: MarketplaceEnvironment
  apiKey?: string
  apiSecret?: string
  stockSyncEnabled?: boolean
  priceSyncEnabled?: boolean
  orderImportEnabled?: boolean
  priceMarkupPercent?: number
}

export interface UpdateStoreInput {
  name?: string
  displayName?: string
  status?: MarketplaceStoreStatus
  environment?: MarketplaceEnvironment
  stockSyncEnabled?: boolean
  priceSyncEnabled?: boolean
  orderImportEnabled?: boolean
  priceMarkupPercent?: number
}

export interface RotateCredentialsInput {
  apiKey: string
  apiSecret: string
}

type StoreRow = {
  id: string
  provider: string
  name: string
  externalSellerId: string
  environment: string
  status: string
  stockSyncEnabled: boolean
  priceSyncEnabled: boolean
  orderImportEnabled: boolean
  priceMarkupPercent: unknown
  lastConnectionAt: unknown
  lastOrderSyncAt: unknown
  lastError: string | null
  createdAt: unknown
  updatedAt: unknown
}

type CredentialSummary = { apiKeyHint: string; version: number } | null

function toStore(row: StoreRow, credential: CredentialSummary): MarketplaceStore {
  const lastOrderSync = dbTimestampToIso(row.lastOrderSyncAt)
  return {
    id: row.id,
    provider: row.provider as MarketplaceProviderType,
    name: row.name,
    code: row.id,
    displayName: row.name,
    externalMerchantId: row.externalSellerId,
    environment: row.environment as MarketplaceEnvironment,
    status: row.status as MarketplaceStoreStatus,
    lastSuccessfulSync: lastOrderSync,
    lastSyncCheckpoint: lastOrderSync,
    lastFailedSync: null,
    lastError: row.lastError,
    lastConnectionCheck: dbTimestampToIso(row.lastConnectionAt),
    stockSyncEnabled: row.stockSyncEnabled,
    priceSyncEnabled: row.priceSyncEnabled,
    orderImportEnabled: row.orderImportEnabled,
    priceMarkupPercent: Number(row.priceMarkupPercent ?? 0),
    hasCredentials: Boolean(credential),
    credentialHint: credential ? `••••${credential.apiKeyHint}` : null,
    credentialVersion: credential?.version ?? null,
    createdAt: dbTimestampToIso(row.createdAt) ?? '',
    updatedAt: dbTimestampToIso(row.updatedAt) ?? '',
  }
}

function storeNotFound(id: string): MarketplaceError {
  return new MarketplaceError({ message: `Mağaza bulunamadı: ${id}`, code: 'NOT_FOUND', provider: 'TRENDYOL' })
}

function validationError(message: string, provider: MarketplaceProviderType = 'TRENDYOL'): MarketplaceError {
  return new MarketplaceError({ message, code: 'VALIDATION_ERROR', provider })
}

function normalizeMarkup(value: unknown, provider: MarketplaceProviderType): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw validationError('Fiyat farkı yüzdesi 0 ile 100 arasında olmalıdır.', provider)
  }
  return Math.round(n * 100) / 100
}

function normalizeEnvironment(value: unknown): MarketplaceEnvironment {
  return value === 'STAGE' ? 'STAGE' : 'PRODUCTION'
}

function assertSecretBoxReady(provider: MarketplaceProviderType): void {
  if (!isSecretBoxConfigured()) {
    throw new MarketplaceError({
      message:
        'Sunucuda MARKETPLACE_CREDENTIALS_KEY ortam değişkeni tanımlı değil veya geçersiz; API anahtarları kaydedilemez. Vercel ortam değişkenlerine ekleyip yeniden deploy edin.',
      code: 'NOT_CONFIGURED',
      provider,
    })
  }
}

function keyHint(apiKey: string): string {
  return apiKey.slice(-4)
}

async function credentialSummaries(storeIds: string[]): Promise<Map<string, { apiKeyHint: string; version: number }>> {
  if (storeIds.length === 0) return new Map()
  const rows = await db.orm.public.MarketplaceCredential.where((c) => c.storeId.in(storeIds))
    .select('storeId', 'apiKeyHint', 'version')
    .all()
  return new Map(rows.map((r) => [r.storeId, { apiKeyHint: r.apiKeyHint, version: r.version }]))
}

export async function getMarketplaceStores(): Promise<MarketplaceStore[]> {
  const rows = (await db.orm.public.MarketplaceStore.orderBy((s) => s.name.asc()).all()) as StoreRow[]
  const creds = await credentialSummaries(rows.map((r) => r.id))
  return rows.map((r) => toStore(r, creds.get(r.id) ?? null))
}

export async function getMarketplaceStoreById(id: string): Promise<MarketplaceStore | null> {
  if (!id) return null
  const row = (await db.orm.public.MarketplaceStore.where({ id }).first()) as StoreRow | null
  if (!row) return null
  const creds = await credentialSummaries([row.id])
  return toStore(row, creds.get(row.id) ?? null)
}

/**
 * Decrypted credentials for outgoing API calls. Server-only: never return this
 * object from an API route.
 */
export async function getStoreCredentialById(storeId: string): Promise<MarketplaceCredential | null> {
  const row = await db.orm.public.MarketplaceCredential.where({ storeId }).first()
  if (!row) return null
  let apiKey: string
  let apiSecret: string
  try {
    apiKey = openSecret(row.apiKeyEncrypted)
    apiSecret = openSecret(row.apiSecretEncrypted)
  } catch (err) {
    throw new MarketplaceError({
      message:
        'Mağaza API anahtarları çözülemedi. MARKETPLACE_CREDENTIALS_KEY tanımlı mı ve anahtarlar bu değerle mi kaydedildi? Gerekirse anahtarları yeniden girin.',
      code: 'NOT_CONFIGURED',
      provider: 'TRENDYOL',
      rawError: err instanceof Error ? err.message : undefined,
    })
  }
  const rotatedAt = dbTimestampToIso(row.rotatedAt) ?? ''
  return {
    id: row.id,
    storeId: row.storeId,
    apiKeyMasked: `••••${row.apiKeyHint}`,
    apiKeyEncrypted: row.apiKeyEncrypted,
    apiSecretMasked: '••••••••',
    apiSecretEncrypted: row.apiSecretEncrypted,
    apiKey,
    apiSecret,
    version: row.version,
    lastRotatedAt: rotatedAt,
    createdAt: rotatedAt,
    updatedAt: rotatedAt,
  }
}

async function writeCredential(storeId: string, apiKey: string, apiSecret: string): Promise<number> {
  const sealed = {
    apiKeyEncrypted: sealSecret(apiKey),
    apiSecretEncrypted: sealSecret(apiSecret),
    apiKeyHint: keyHint(apiKey),
    rotatedAt: toDbTimestamp(),
  }
  const existing = await db.orm.public.MarketplaceCredential.where({ storeId }).first()
  if (existing) {
    const version = existing.version + 1
    await db.orm.public.MarketplaceCredential.where({ storeId }).update({ ...sealed, version } as never)
    return version
  }
  await db.orm.public.MarketplaceCredential.create({ storeId, ...sealed, version: 1 } as never)
  return 1
}

export async function createMarketplaceStore(
  input: CreateStoreInput,
  adminUserId: string
): Promise<MarketplaceStore> {
  const provider = input.provider
  if (!SUPPORTED_MARKETPLACES.includes(provider as (typeof SUPPORTED_MARKETPLACES)[number])) {
    throw validationError(`Desteklenmeyen pazaryeri: ${provider}`)
  }
  const name = input.name?.trim()
  const externalMerchantId = input.externalMerchantId?.trim()
  const environment = normalizeEnvironment(input.environment)
  if (!name) throw validationError('Mağaza adı zorunludur.', provider)
  if (!externalMerchantId) throw validationError('Satıcı ID (Trendyol) / Merchant ID (Hepsiburada) zorunludur.', provider)

  const apiKey = input.apiKey?.trim()
  const apiSecret = input.apiSecret?.trim()
  if (Boolean(apiKey) !== Boolean(apiSecret)) {
    throw validationError('API anahtarı ve gizli anahtar birlikte girilmelidir.', provider)
  }
  // Fail before writing anything, so a missing key never leaves a store without its credentials.
  if (apiKey) assertSecretBoxReady(provider)

  const existing = await db.orm.public.MarketplaceStore.where({ provider, externalSellerId: externalMerchantId, environment }).first()
  if (existing) {
    throw validationError(
      `Bu ${provider} satıcı ID (${externalMerchantId}) ve ortam (${environment}) için zaten kayıtlı bir mağaza var: "${existing.name}".`,
      provider
    )
  }

  const markup = normalizeMarkup(input.priceMarkupPercent, provider) ?? 0
  const created = await db.orm.public.MarketplaceStore.create({
    provider,
    name,
    externalSellerId: externalMerchantId,
    environment,
    status: 'ACTIVE',
    stockSyncEnabled: Boolean(input.stockSyncEnabled),
    priceSyncEnabled: Boolean(input.priceSyncEnabled),
    orderImportEnabled: input.orderImportEnabled ?? true,
    priceMarkupPercent: dbNumeric(markup),
  } as never)
  const id = (created as { id: string }).id

  if (apiKey && apiSecret) await writeCredential(id, apiKey, apiSecret)

  await logAuditEvent({
    userId: adminUserId,
    action: 'marketplace.store.created',
    entity: 'MarketplaceStore',
    entityId: id,
    metadata: { provider, name, externalMerchantId, environment, credentials: Boolean(apiKey) },
  })

  return (await getMarketplaceStoreById(id))!
}

export async function updateMarketplaceStore(
  id: string,
  input: UpdateStoreInput,
  adminUserId: string
): Promise<MarketplaceStore> {
  const store = await getMarketplaceStoreById(id)
  if (!store) throw storeNotFound(id)

  const changes: Record<string, unknown> = {}
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (!name) throw validationError('Mağaza adı boş olamaz.', store.provider)
    changes.name = name
  }
  if (input.status !== undefined) {
    if (!['ACTIVE', 'INACTIVE'].includes(input.status)) throw validationError('Geçersiz mağaza durumu.', store.provider)
    changes.status = input.status
  }
  if (input.environment !== undefined) {
    const environment = normalizeEnvironment(input.environment)
    if (environment !== store.environment) {
      const clash = await db.orm.public.MarketplaceStore.where({
        provider: store.provider,
        externalSellerId: store.externalMerchantId,
        environment,
      }).first()
      if (clash) throw validationError(`Bu satıcı ID için ${environment} ortamında zaten bir mağaza var.`, store.provider)
      changes.environment = environment
    }
  }
  if (input.stockSyncEnabled !== undefined) changes.stockSyncEnabled = Boolean(input.stockSyncEnabled)
  if (input.priceSyncEnabled !== undefined) changes.priceSyncEnabled = Boolean(input.priceSyncEnabled)
  if (input.orderImportEnabled !== undefined) changes.orderImportEnabled = Boolean(input.orderImportEnabled)
  const markup = normalizeMarkup(input.priceMarkupPercent, store.provider)
  if (markup !== undefined) changes.priceMarkupPercent = dbNumeric(markup)

  if (Object.keys(changes).length > 0) {
    await db.orm.public.MarketplaceStore.where({ id }).update(changes as never)
  }

  const updated = (await getMarketplaceStoreById(id))!
  await logAuditEvent({
    userId: adminUserId,
    action: 'marketplace.store.updated',
    entity: 'MarketplaceStore',
    entityId: id,
    metadata: {
      provider: updated.provider,
      changed: Object.keys(changes),
      status: updated.status,
      environment: updated.environment,
      stockSyncEnabled: updated.stockSyncEnabled,
      priceSyncEnabled: updated.priceSyncEnabled,
      orderImportEnabled: updated.orderImportEnabled,
      priceMarkupPercent: updated.priceMarkupPercent,
    },
  })
  return updated
}

export async function setStoreStatus(
  id: string,
  status: MarketplaceStoreStatus,
  adminUserId: string
): Promise<MarketplaceStore> {
  return updateMarketplaceStore(id, { status }, adminUserId)
}

export async function deleteMarketplaceStore(id: string, adminUserId: string): Promise<void> {
  const store = await getMarketplaceStoreById(id)
  if (!store) throw storeNotFound(id)
  // Credentials go with the store (ON DELETE CASCADE).
  await db.runtime().execute(db.raw.sql`DELETE FROM marketplace_stores WHERE id = ${id}`.affectedCount().build())
  await logAuditEvent({
    userId: adminUserId,
    action: 'marketplace.store.deleted',
    entity: 'MarketplaceStore',
    entityId: id,
    metadata: { provider: store.provider, name: store.name, externalMerchantId: store.externalMerchantId },
  })
}

export async function rotateStoreCredentials(
  id: string,
  input: RotateCredentialsInput,
  adminUserId: string
): Promise<{ success: boolean; version: number }> {
  const store = await getMarketplaceStoreById(id)
  if (!store) throw storeNotFound(id)

  const apiKey = input.apiKey?.trim()
  const apiSecret = input.apiSecret?.trim()
  if (!apiKey || !apiSecret) {
    throw validationError('Yeni API anahtarı ve API gizli anahtarı zorunludur.', store.provider)
  }
  assertSecretBoxReady(store.provider)

  const version = await writeCredential(id, apiKey, apiSecret)
  // New keys deserve a fresh connection test; clear the old result.
  await db.orm.public.MarketplaceStore.where({ id }).update({ lastError: null, lastConnectionAt: null } as never)

  // Never log secrets: only the version and the 4-character hint.
  await logAuditEvent({
    userId: adminUserId,
    action: 'marketplace.credentials.rotated',
    entity: 'MarketplaceCredential',
    entityId: id,
    metadata: { storeId: id, provider: store.provider, version, keyHint: keyHint(apiKey) },
  })

  return { success: true, version }
}

export async function testStoreConnection(
  id: string,
  adminUserId: string
): Promise<ConnectionTestResult> {
  const store = await getMarketplaceStoreById(id)
  if (!store) throw storeNotFound(id)

  let result: ConnectionTestResult
  try {
    const credential = await getStoreCredentialById(id)
    const provider = MarketplaceProviderFactory.getProvider(store, credential ?? undefined)
    result = await provider.testConnection()
  } catch (err) {
    result = {
      success: false,
      code: 'NOT_CONFIGURED',
      message: err instanceof Error ? err.message : 'Bağlantı testi yapılamadı.',
    }
  }

  await db.orm.public.MarketplaceStore.where({ id }).update({
    lastConnectionAt: toDbTimestamp(),
    lastError: result.success ? null : result.message.slice(0, 1000),
    ...(result.success && store.status === 'ERROR' ? { status: 'ACTIVE' } : {}),
  } as never)

  await logAuditEvent({
    userId: adminUserId,
    action: 'marketplace.connection.tested',
    entity: 'MarketplaceStore',
    entityId: id,
    metadata: { provider: store.provider, code: result.code, success: result.success },
  })

  return result
}

// ─────────────────────────────────────────────────────────────
// PRODUCT MAPPING SERVICES (linked rows of marketplace_listings; see listings.service)
// ─────────────────────────────────────────────────────────────

export interface CreateMappingInput {
  storeId: string
  productId: string
  externalSku: string
  externalProductId?: string
  externalBarcode?: string
  externalVariantId?: string
}

type LinkedListingRow = {
  id: string
  storeId: string
  barcode: string
  stockCode: string | null
  externalId: string | null
  productId: string | null
  variantId: string | null
  lastSeenAt: unknown
  createdAt: unknown
  updatedAt: unknown
}

async function listingsAsMappings(rows: LinkedListingRow[]): Promise<MarketplaceProductMapping[]> {
  const productIds = [...new Set(rows.map((r) => r.productId).filter((id): id is string => Boolean(id)))]
  const products = productIds.length
    ? await db.orm.public.Product.where((p) => p.id.in(productIds)).select('id', 'name', 'sku', 'barcode').all()
    : []
  const byId = new Map(products.map((p) => [p.id, p]))
  return rows
    .filter((r) => r.productId && byId.has(r.productId))
    .map((r) => {
      const product = byId.get(r.productId!)!
      return {
        id: r.id,
        storeId: r.storeId,
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        productBarcode: product.barcode ?? null,
        externalProductId: r.externalId,
        externalSku: r.stockCode || r.barcode,
        externalBarcode: r.barcode,
        externalVariantId: r.variantId,
        status: 'MAPPED' as const,
        lastSyncedAt: dbTimestampToIso(r.lastSeenAt),
        createdAt: dbTimestampToIso(r.createdAt) ?? '',
        updatedAt: dbTimestampToIso(r.updatedAt) ?? '',
      }
    })
}

export async function getMarketplaceMappings(storeId?: string): Promise<MarketplaceProductMapping[]> {
  const rows = (await (storeId
    ? db.orm.public.MarketplaceListing.where({ storeId, archived: false })
    : db.orm.public.MarketplaceListing.where({ archived: false })
  ).all()) as LinkedListingRow[]
  return listingsAsMappings(rows.filter((r) => r.productId))
}

/**
 * Links an existing listing (found by barcode or stock code on the store) to a site
 * product. Listings come from the marketplace; they are not created here.
 */
export async function createProductMapping(
  input: CreateMappingInput,
  adminUserId: string
): Promise<MarketplaceProductMapping> {
  const store = await getMarketplaceStoreById(input.storeId)
  if (!store) {
    throw new MarketplaceError({ message: `Hedef mağaza bulunamadı: ${input.storeId}`, code: 'NOT_FOUND', provider: 'TRENDYOL' })
  }
  const product = await db.orm.public.Product.where({ id: input.productId }).select('id').first()
  if (!product) {
    throw new MarketplaceError({ message: `ZUULAB ürünü bulunamadı: ${input.productId}`, code: 'NOT_FOUND', provider: store.provider })
  }
  const code = (input.externalBarcode || input.externalSku || '').trim().toLowerCase()
  const listings = (await db.orm.public.MarketplaceListing.where({ storeId: store.id }).all()) as LinkedListingRow[]
  const listing = listings.find((l) => l.barcode.toLowerCase() === code || l.stockCode?.toLowerCase() === code)
  if (!listing) {
    throw new MarketplaceError({
      message: `Bu mağazada "${input.externalBarcode || input.externalSku}" barkodlu/stok kodlu ürün yok. Önce pazaryerinden ürünleri çekin.`,
      code: 'VALIDATION_ERROR',
      provider: store.provider,
    })
  }
  await db.orm.public.MarketplaceListing.where({ id: listing.id }).update({
    productId: product.id,
    variantId: null,
    matchMethod: 'MANUAL',
    ignored: false,
  } as never)
  await logAuditEvent({
    userId: adminUserId,
    action: 'marketplace.mapping.created',
    entity: 'MarketplaceListing',
    entityId: listing.id,
    metadata: { storeId: store.id, productId: product.id, barcode: listing.barcode },
  })
  const [mapping] = await listingsAsMappings([{ ...listing, productId: product.id, variantId: null }])
  return mapping
}

/** Unlinks a listing (the id is the listing id). */
export async function deleteProductMapping(id: string, adminUserId: string): Promise<boolean> {
  const listing = (await db.orm.public.MarketplaceListing.where({ id }).first()) as LinkedListingRow | null
  if (!listing || !listing.productId) return false
  await db.orm.public.MarketplaceListing.where({ id }).update({ productId: null, variantId: null, matchMethod: null } as never)
  await logAuditEvent({
    userId: adminUserId,
    action: 'marketplace.mapping.deleted',
    entity: 'MarketplaceListing',
    entityId: id,
    metadata: { storeId: listing.storeId, barcode: listing.barcode },
  })
  return true
}

// ─────────────────────────────────────────────────────────────
// ORDER IDENTITY & IDEMPOTENCY FOUNDATION
// ─────────────────────────────────────────────────────────────

// In-memory webhooks storage
const inMemoryWebhookEvents: Map<string, MarketplaceWebhookEvent> = new Map()
const inMemoryWebhookDedupKeys: Set<string> = new Set()

export interface IngestOrderResult {
  action: 'CREATED' | 'UPDATED' | 'UNCHANGED'
  order: MarketplaceOrder
  reconciliationStatus: OrderReconciliationStatus
  unmatchedCount: number
}

/**
 * Reconciles an array of order items against configured MarketplaceProductMappings.
 * Strict SKU rule: Only matches via explicit SKU alignment. No pure name matching!
 */
async function reconcileItems(
  storeId: string,
  items: Array<{
    id?: string
    externalLineItemId: string
    externalSku: string
    externalBarcode: string | null
    merchantSku: string | null
    productName: string
    quantity: number
    unitPrice: number
    totalPrice: number
    rawStatus: string
    status: NormalizedMarketplaceStatus
  }>,
  orderId: string
): Promise<{
  reconciledItems: MarketplaceOrderItem[]
  orderReconciliationStatus: OrderReconciliationStatus
  unmatchedCount: number
}> {
  const now = new Date().toISOString()
  const storeMappings = await getMarketplaceMappings(storeId)

  let matchedCount = 0
  let unmatchedCount = 0

  const reconciledItems: MarketplaceOrderItem[] = []

  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx]
    // Barcode is the marketplace's identity for a listing; stock code is the fallback.
    const barcode = it.externalBarcode?.toLowerCase().trim()
    const sku = it.externalSku.toLowerCase().trim()
    const mapping =
      (barcode ? storeMappings.find((m) => m.externalBarcode?.toLowerCase() === barcode) : undefined) ??
      storeMappings.find((m) => m.externalSku.toLowerCase() === sku || m.externalBarcode?.toLowerCase() === sku)

    const isMatched = Boolean(mapping && mapping.productId)
    let stockStatus: ItemStockStatus = 'UNKNOWN'
    let productName = it.productName
    let productId: string | null = null

    if (isMatched && mapping) {
      matchedCount++
      productId = mapping.productId
      productName = mapping.productName

      // Check real central inventory status
      try {
        const inv = await getInventoryStatus(mapping.productId)
        stockStatus =
          inv.available > 5
            ? 'IN_STOCK'
            : inv.available > 0
            ? 'LOW_STOCK'
            : 'OUT_OF_STOCK'
      } catch {
        stockStatus = 'IN_STOCK'
      }
    } else {
      unmatchedCount++
    }

    reconciledItems.push({
      id: it.id || `mitem-${orderId}-${idx + 1}`,
      marketplaceOrderId: orderId,
      externalLineItemId: it.externalLineItemId,
      externalSku: it.externalSku,
      externalBarcode: it.externalBarcode,
      merchantSku: it.merchantSku,
      productId,
      productName,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      totalPrice: it.totalPrice,
      rawStatus: it.rawStatus,
      status: it.status,
      reconciliationStatus: isMatched ? 'MATCHED' : 'UNMATCHED',
      stockStatus,
      createdAt: now,
      updatedAt: now,
    })
  }

  let orderReconciliationStatus: OrderReconciliationStatus = 'PENDING'
  if (reconciledItems.length > 0) {
    if (unmatchedCount === 0) {
      orderReconciliationStatus = 'MATCHED'
    } else if (matchedCount > 0) {
      orderReconciliationStatus = 'PARTIALLY_MATCHED'
    } else {
      orderReconciliationStatus = 'UNMATCHED'
    }
  }

  return {
    reconciledItems,
    orderReconciliationStatus,
    unmatchedCount,
  }
}

/**
 * Builds a deterministic snapshot of critical external order data
 */
function createOrderSnapshot(
  normalized: any,
  items: MarketplaceOrderItem[]
): MarketplaceOrderSnapshot {
  return {
    customerName: normalized.customerName,
    customerPhone: normalized.customerPhone || null,
    shippingAddress: normalized.shippingAddress,
    billingAddress: normalized.billingAddress || null,
    externalOrderNumber: normalized.externalOrderNumber,
    orderDate: normalized.orderDate,
    paymentMethod: normalized.paymentMethod || null,
    packageNumber: normalized.packageNumber || null,
    cargoProvider: normalized.cargoProvider || null,
    totalAmount: normalized.totalAmount,
    currency: normalized.currency || 'TRY',
    items: items.map((it) => ({
      externalLineItemId: it.externalLineItemId,
      externalSku: it.externalSku,
      merchantSku: it.merchantSku,
      productName: it.productName,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      totalPrice: it.totalPrice,
    })),
  }
}

export async function ingestMarketplaceOrder(
  storeId: string,
  rawPayload: any
): Promise<IngestOrderResult> {
  const store = await getMarketplaceStoreById(storeId)
  if (!store) {
    throw new MarketplaceError({
      message: `Pazaryeri mağazası bulunamadı: ${storeId}`,
      code: 'NOT_FOUND',
      provider: 'HEPSIBURADA',
    })
  }

  // Normalizing a payload is pure; credentials are not needed for it.
  const provider = MarketplaceProviderFactory.getProvider(store)

  // Normalize order using provider-specific mapper
  const normalized = provider.normalizeOrder(rawPayload)

  if (!normalized.externalOrderId) {
    throw new MarketplaceError({
      message: 'Sipariş yükünde externalOrderId bulunamadı.',
      code: 'VALIDATION_ERROR',
      provider: store.provider,
    })
  }

  // Idempotency: Unique key = storeId + externalOrderId
  const existingOrder = Array.from(inMemoryOrders.values()).find(
    (o) =>
      o.storeId === storeId && o.externalOrderId === normalized.externalOrderId
  )

  const now = new Date().toISOString()

  if (existingOrder) {
    // Reconcile line items against current mappings
    const { reconciledItems, orderReconciliationStatus, unmatchedCount } = await reconcileItems(
      storeId,
      normalized.items,
      existingOrder.id
    )

    const isUnchanged =
      existingOrder.status === normalized.status &&
      existingOrder.rawStatus === normalized.rawStatus &&
      existingOrder.totalAmount === normalized.totalAmount &&
      existingOrder.reconciliationStatus === orderReconciliationStatus &&
      existingOrder.items.length === reconciledItems.length

    if (isUnchanged) {
      return {
        action: 'UNCHANGED',
        order: existingOrder,
        reconciliationStatus: existingOrder.reconciliationStatus || 'PENDING',
        unmatchedCount: existingOrder.unmatchedCount || 0,
      }
    }

    const prevStatus = existingOrder.status
    existingOrder.status = normalized.status
    existingOrder.rawStatus = normalized.rawStatus
    existingOrder.totalAmount = normalized.totalAmount
    existingOrder.cargoProvider = normalized.cargoProvider || existingOrder.cargoProvider
    existingOrder.cargoTrackingNumber = normalized.cargoTrackingNumber || existingOrder.cargoTrackingNumber
    existingOrder.packageNumber = normalized.packageNumber || existingOrder.packageNumber
    existingOrder.paymentMethod = normalized.paymentMethod || existingOrder.paymentMethod
    existingOrder.lastModifiedAt = normalized.lastModifiedAt
    existingOrder.reconciliationStatus = orderReconciliationStatus
    existingOrder.items = reconciledItems
    existingOrder.unmatchedCount = unmatchedCount
    existingOrder.syncedAt = now
    existingOrder.updatedAt = now

    inMemoryOrders.set(existingOrder.id, existingOrder)

    // Synchronize inventory based on status transition
    await syncMarketplaceOrderInventory(existingOrder, prevStatus)

    return {
      action: 'UPDATED',
      order: existingOrder,
      reconciliationStatus: orderReconciliationStatus,
      unmatchedCount,
    }
  }

  // Create new MarketplaceOrder with line items
  const orderId = `mord-${Date.now()}-${Math.floor(Math.random() * 1000)}`

  const { reconciledItems, orderReconciliationStatus, unmatchedCount } = await reconcileItems(
    storeId,
    normalized.items,
    orderId
  )

  const snapshot = createOrderSnapshot(normalized, reconciledItems)

  const newOrder: MarketplaceOrder = {
    id: orderId,
    storeId,
    externalOrderId: normalized.externalOrderId,
    externalOrderNumber: normalized.externalOrderNumber,
    status: normalized.status,
    rawStatus: normalized.rawStatus,
    reconciliationStatus: orderReconciliationStatus,
    orderDate: normalized.orderDate,
    lastModifiedAt: normalized.lastModifiedAt,
    customerName: normalized.customerName,
    customerEmail: normalized.customerEmail,
    customerPhone: normalized.customerPhone,
    paymentMethod: normalized.paymentMethod || null,
    shippingAddress: normalized.shippingAddress,
    billingAddress: normalized.billingAddress,
    cargoProvider: normalized.cargoProvider,
    cargoTrackingNumber: normalized.cargoTrackingNumber,
    packageNumber: normalized.packageNumber,
    totalAmount: normalized.totalAmount,
    currency: normalized.currency,
    rawPayload: normalized.rawPayload,
    snapshot,
    items: reconciledItems,
    unmatchedCount,
    syncedAt: now,
    createdAt: now,
    updatedAt: now,
  }

  inMemoryOrders.set(orderId, newOrder)

  // Synchronize initial inventory reservation if MATCHED and active
  await syncMarketplaceOrderInventory(newOrder)

  return {
    action: 'CREATED',
    order: newOrder,
    reconciliationStatus: orderReconciliationStatus,
    unmatchedCount,
  }
}

/**
 * Synchronizes inventory for a marketplace order according to explicit lifecycle rules:
 * - NEW / APPROVED / PREPARING + MATCHED -> Idempotent reservation
 * - SHIPPED / DELIVERED -> Idempotent commit (deduct physical stock)
 * - CANCELLED -> Idempotent release
 * - RETURNED -> RMA restock only when physically inspected
 * - UNMATCHED / PARTIALLY_MATCHED -> Safety rule: 0 stock mutation!
 */
export async function syncMarketplaceOrderInventory(
  order: MarketplaceOrder,
  previousStatus?: NormalizedMarketplaceStatus
): Promise<void> {
  // Safety rule: Never mutate stock for unmapped or partially matched orders
  if (order.reconciliationStatus !== 'MATCHED') {
    return
  }

  const items = order.items
    .filter((it) => it.productId !== null)
    .map((it) => ({
      productId: it.productId!,
      quantity: it.quantity,
      externalLineItemId: it.externalLineItemId,
    }))

  if (items.length === 0) return

  if (
    order.status === 'NEW' ||
    order.status === 'APPROVED' ||
    order.status === 'PREPARING'
  ) {
    await reserveInventory(items, order.externalOrderNumber, {
      context: 'MARKETPLACE',
      storeId: order.storeId,
      externalOrderId: order.externalOrderId,
      reason: `Pazaryeri Siparişi (#${order.externalOrderNumber})`,
    })
  } else if (order.status === 'SHIPPED' || order.status === 'DELIVERED') {
    await commitInventoryReservation(items, order.externalOrderNumber, {
      context: 'MARKETPLACE',
      storeId: order.storeId,
      externalOrderId: order.externalOrderId,
      reason: `Pazaryeri Siparişi Sevk Edildi (#${order.externalOrderNumber})`,
    })
  } else if (order.status === 'CANCELLED') {
    await releaseInventoryReservation(items, order.externalOrderNumber, {
      context: 'MARKETPLACE',
      storeId: order.storeId,
      externalOrderId: order.externalOrderId,
      reason: `Pazaryeri Siparişi İptal Edildi (#${order.externalOrderNumber})`,
    })
  }
}

/**
 * Reconciles a single marketplace order against current product mappings.
 * Used when an admin creates a new mapping and re-evaluates previously unmatched orders.
 */
export async function reconcileMarketplaceOrder(
  orderId: string,
  adminUserId?: string
): Promise<MarketplaceOrder | null> {
  const order = inMemoryOrders.get(orderId)
  if (!order) return null

  const prevRecStatus = order.reconciliationStatus
  const { reconciledItems, orderReconciliationStatus, unmatchedCount } = await reconcileItems(
    order.storeId,
    order.items,
    order.id
  )

  order.items = reconciledItems
  order.reconciliationStatus = orderReconciliationStatus
  order.unmatchedCount = unmatchedCount
  order.updatedAt = new Date().toISOString()

  inMemoryOrders.set(order.id, order)

  // If newly became MATCHED, reserve inventory idempotently
  if (prevRecStatus !== 'MATCHED' && order.reconciliationStatus === 'MATCHED') {
    await syncMarketplaceOrderInventory(order)
  }

  if (adminUserId) {
    await logAuditEvent({
      userId: adminUserId,
      action: 'marketplace.order.reconciled',
      entity: 'MarketplaceOrder',
      entityId: order.id,
      metadata: {
        externalOrderNumber: order.externalOrderNumber,
        newReconciliationStatus: orderReconciliationStatus,
        unmatchedCount,
      },
    })
  }

  return order
}

/**
 * Reconciles all unmatched or partially matched orders for a store.
 */
export async function reconcileUnmatchedOrders(
  storeId?: string,
  adminUserId?: string
): Promise<{ checkedCount: number; updatedCount: number }> {
  let orders = Array.from(inMemoryOrders.values()).filter(
    (o) => o.reconciliationStatus === 'UNMATCHED' || o.reconciliationStatus === 'PARTIALLY_MATCHED'
  )

  if (storeId) {
    orders = orders.filter((o) => o.storeId === storeId)
  }

  let updatedCount = 0

  for (const ord of orders) {
    const prevStatus = ord.reconciliationStatus
    await reconcileMarketplaceOrder(ord.id)
    if (ord.reconciliationStatus !== prevStatus) {
      updatedCount++
    }
  }

  if (adminUserId && updatedCount > 0) {
    await logAuditEvent({
      userId: adminUserId,
      action: 'marketplace.order.mapping_applied',
      entity: 'MarketplaceOrder',
      metadata: { storeId: storeId || 'ALL', updatedCount },
    })
  }

  return { checkedCount: orders.length, updatedCount }
}

export interface GetMarketplaceOrdersFilters {
  provider?: MarketplaceProviderType
  storeId?: string
  status?: NormalizedMarketplaceStatus
  reconciliationStatus?: OrderReconciliationStatus
  startDate?: string
  endDate?: string
  orderNumber?: string
  sku?: string
}

export async function getMarketplaceOrders(
  filters: GetMarketplaceOrdersFilters = {}
): Promise<MarketplaceOrder[]> {
  let list = Array.from(inMemoryOrders.values())

  if (filters.provider) {
    const matchingStoreIds = (await getMarketplaceStores())
      .filter((s) => s.provider === filters.provider)
      .map((s) => s.id)
    list = list.filter((o) => matchingStoreIds.includes(o.storeId))
  }

  if (filters.storeId) {
    list = list.filter((o) => o.storeId === filters.storeId)
  }

  if (filters.status) {
    list = list.filter((o) => o.status === filters.status)
  }

  if (filters.reconciliationStatus) {
    list = list.filter((o) => o.reconciliationStatus === filters.reconciliationStatus)
  }

  if (filters.startDate) {
    list = list.filter((o) => o.orderDate >= filters.startDate!)
  }

  if (filters.endDate) {
    list = list.filter((o) => o.orderDate <= filters.endDate!)
  }

  if (filters.orderNumber) {
    const q = filters.orderNumber.toLowerCase().trim()
    list = list.filter(
      (o) =>
        o.externalOrderNumber.toLowerCase().includes(q) ||
        o.externalOrderId.toLowerCase().includes(q) ||
        (o.packageNumber && o.packageNumber.toLowerCase().includes(q))
    )
  }

  if (filters.sku) {
    const s = filters.sku.toLowerCase().trim()
    list = list.filter((o) =>
      o.items.some(
        (it) =>
          it.externalSku.toLowerCase().includes(s) ||
          (it.merchantSku && it.merchantSku.toLowerCase().includes(s))
      )
    )
  }

  return list.sort((a, b) => b.orderDate.localeCompare(a.orderDate))
}

export async function getMarketplaceOrderById(
  id: string
): Promise<MarketplaceOrder | null> {
  return inMemoryOrders.get(id) || null
}

// ─────────────────────────────────────────────────────────────
// SYNC JOBS ARCHITECTURE
// ─────────────────────────────────────────────────────────────

export async function createSyncJob(
  storeId: string,
  jobType: 'ORDERS' | 'STOCK' | 'PRODUCTS',
  strategy: MarketplaceSyncStrategy
): Promise<MarketplaceSyncJob> {
  const id = `job-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  const now = new Date().toISOString()

  const job: MarketplaceSyncJob = {
    id,
    storeId,
    jobType,
    strategy,
    status: 'RUNNING',
    cursor: null,
    page: 1,
    recordsRead: 0,
    recordsCreated: 0,
    recordsUpdated: 0,
    recordsSkipped: 0,
    recordsFailed: 0,
    unmatched: 0,
    unchanged: 0,
    errorMessage: null,
    startedAt: now,
    finishedAt: null,
    createdAt: now,
  }

  inMemorySyncJobs.set(id, job)
  return job
}

export async function updateSyncJob(
  id: string,
  updates: Partial<MarketplaceSyncJob>
): Promise<MarketplaceSyncJob | null> {
  const job = inMemorySyncJobs.get(id)
  if (!job) return null

  const updated = {
    ...job,
    ...updates,
  }

  inMemorySyncJobs.set(id, updated)
  return updated
}

export async function getMarketplaceSyncJobs(
  storeId?: string
): Promise<MarketplaceSyncJob[]> {
  const jobs = Array.from(inMemorySyncJobs.values())
  if (storeId) {
    return jobs.filter((j) => j.storeId === storeId)
  }
  return jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getMarketplaceSyncJobById(
  id: string
): Promise<MarketplaceSyncJob | null> {
  return inMemorySyncJobs.get(id) || null
}

export async function updateStoreSyncCheckpoint(
  storeId: string,
  updates: {
    lastSuccessfulSync?: string
    lastAttemptedSync?: string
    lastSyncCheckpoint?: string
    cursor?: string
    windowStart?: string
    windowEnd?: string
    lastError?: string | null
  }
): Promise<MarketplaceStore | null> {
  const changes: Record<string, unknown> = {}
  const syncedUntil = updates.lastSyncCheckpoint ?? updates.lastSuccessfulSync
  if (syncedUntil) changes.lastOrderSyncAt = toDbTimestamp(new Date(syncedUntil))
  if (updates.lastError !== undefined) changes.lastError = updates.lastError ? updates.lastError.slice(0, 1000) : null
  if (Object.keys(changes).length > 0) {
    await db.orm.public.MarketplaceStore.where({ id: storeId }).update(changes as never)
  }
  return getMarketplaceStoreById(storeId)
}

// ─────────────────────────────────────────────────────────────
// WEBHOOK ARCHITECTURE & DEDUPLICATION
// ─────────────────────────────────────────────────────────────

export async function recordWebhookEvent(
  event: MarketplaceWebhookEvent
): Promise<void> {
  inMemoryWebhookEvents.set(event.id, event)
}

export function isDuplicateWebhook(dedupKey: string): boolean {
  if (inMemoryWebhookDedupKeys.has(dedupKey)) {
    return true
  }
  inMemoryWebhookDedupKeys.add(dedupKey)
  return false
}

export async function getWebhookEvents(
  storeId?: string
): Promise<MarketplaceWebhookEvent[]> {
  const all = Array.from(inMemoryWebhookEvents.values())
  if (storeId) {
    return all.filter((w) => w.storeId === storeId)
  }
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
