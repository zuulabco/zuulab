import 'server-only'
import type {
  MarketplaceStore,
  MarketplaceCredential,
  MarketplaceProductMapping,
  MarketplaceProviderType,
  MarketplaceStoreStatus,
  MarketplaceEnvironment,
  ConnectionTestResult,
} from './marketplace.interface'
import { MarketplaceProviderFactory } from './provider.factory'
import { MarketplaceError } from './marketplace-error'
import { logAuditEvent } from '../admin.service'
import { db } from '@/prisma/db'
import { dbNumeric } from '@/lib/db/numeric'
import { dbTimestampToIso, toDbTimestamp } from '@/lib/db/time'
import { isSecretBoxConfigured, openSecret, sealSecret } from '@/lib/security/secret-box'

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
