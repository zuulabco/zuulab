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
import { MOCK_PRODUCTS } from '@/lib/mock-data'
import {
  reserveInventory,
  releaseInventoryReservation,
  commitInventoryReservation,
  getInventoryStatus,
} from '../inventory.service'

// ─────────────────────────────────────────────────────────────
// IN-MEMORY STORAGE & INITIAL SEED (2 HB + 2 TY + DIRECT)
// ─────────────────────────────────────────────────────────────

const inMemoryStores: Map<string, MarketplaceStore> = new Map([
  [
    'store-hb-1',
    {
      id: 'store-hb-1',
      provider: 'HEPSIBURADA',
      name: 'Hepsiburada Mağaza 1',
      code: 'hb-store-1',
      displayName: 'ZUULAB 3D - Hepsiburada Ana',
      externalMerchantId: 'hb-merch-001',
      environment: 'STAGE',
      status: 'ACTIVE',
      lastSuccessfulSync: null,
      lastFailedSync: null,
      lastError: null,
      lastConnectionCheck: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  [
    'store-hb-2',
    {
      id: 'store-hb-2',
      provider: 'HEPSIBURADA',
      name: 'Hepsiburada Mağaza 2',
      code: 'hb-store-2',
      displayName: 'ZUULAB Living - Hepsiburada Yan',
      externalMerchantId: 'hb-merch-002',
      environment: 'STAGE',
      status: 'ACTIVE',
      lastSuccessfulSync: null,
      lastFailedSync: null,
      lastError: null,
      lastConnectionCheck: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  [
    'store-ty-1',
    {
      id: 'store-ty-1',
      provider: 'TRENDYOL',
      name: 'Trendyol Mağaza 1',
      code: 'ty-store-1',
      displayName: 'ZUULAB Design - Trendyol Ana',
      externalMerchantId: 'ty-supp-1001',
      environment: 'STAGE',
      status: 'ACTIVE',
      lastSuccessfulSync: null,
      lastFailedSync: null,
      lastError: null,
      lastConnectionCheck: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  [
    'store-ty-2',
    {
      id: 'store-ty-2',
      provider: 'TRENDYOL',
      name: 'Trendyol Mağaza 2',
      code: 'ty-store-2',
      displayName: 'ZUULAB Art - Trendyol Butik',
      externalMerchantId: 'ty-supp-1002',
      environment: 'STAGE',
      status: 'ACTIVE',
      lastSuccessfulSync: null,
      lastFailedSync: null,
      lastError: null,
      lastConnectionCheck: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
])

const inMemoryCredentials: Map<string, MarketplaceCredential> = new Map([
  [
    'store-hb-1',
    {
      id: 'cred-hb-1',
      storeId: 'store-hb-1',
      apiKeyMasked: '••••••••••••',
      apiKeyEncrypted: 'mock-enc-hb1-key',
      apiSecretMasked: '••••••••••••',
      apiSecretEncrypted: 'mock-enc-hb1-secret',
      version: 1,
      lastRotatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  [
    'store-hb-2',
    {
      id: 'cred-hb-2',
      storeId: 'store-hb-2',
      apiKeyMasked: '••••••••••••',
      apiKeyEncrypted: 'mock-enc-hb2-key',
      apiSecretMasked: '••••••••••••',
      apiSecretEncrypted: 'mock-enc-hb2-secret',
      version: 1,
      lastRotatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  [
    'store-ty-1',
    {
      id: 'cred-ty-1',
      storeId: 'store-ty-1',
      apiKeyMasked: '••••••••••••',
      apiKeyEncrypted: 'mock-enc-ty1-key',
      apiSecretMasked: '••••••••••••',
      apiSecretEncrypted: 'mock-enc-ty1-secret',
      version: 1,
      lastRotatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  [
    'store-ty-2',
    {
      id: 'cred-ty-2',
      storeId: 'store-ty-2',
      apiKeyMasked: '••••••••••••',
      apiKeyEncrypted: 'mock-enc-ty2-key',
      apiSecretMasked: '••••••••••••',
      apiSecretEncrypted: 'mock-enc-ty2-secret',
      version: 1,
      lastRotatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
])

const inMemoryMappings: Map<string, MarketplaceProductMapping> = new Map()

// Seed default SKU mappings for sample products
if (inMemoryMappings.size === 0) {
  const p1 = MOCK_PRODUCTS[0]
  const p2 = MOCK_PRODUCTS[1]

  if (p1) {
    inMemoryMappings.set('map-1', {
      id: 'map-1',
      storeId: 'store-hb-1',
      productId: p1.id,
      productName: p1.name,
      productSku: p1.sku,
      productBarcode: (p1 as any).barcode || '868000100001',
      externalProductId: 'HB-PROD-001',
      externalSku: `${p1.sku}-HB`,
      externalBarcode: (p1 as any).barcode || '868000100001',
      externalVariantId: null,
      status: 'MAPPED',
      lastSyncedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }

  if (p2) {
    inMemoryMappings.set('map-2', {
      id: 'map-2',
      storeId: 'store-ty-1',
      productId: p2.id,
      productName: p2.name,
      productSku: p2.sku,
      productBarcode: (p2 as any).barcode || '868000100002',
      externalProductId: 'TY-PROD-002',
      externalSku: `${p2.sku}-TY`,
      externalBarcode: (p2 as any).barcode || '868000100002',
      externalVariantId: null,
      status: 'MAPPED',
      lastSyncedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }
}

const inMemoryOrders: Map<string, MarketplaceOrder> = new Map()
const inMemorySyncJobs: Map<string, MarketplaceSyncJob> = new Map()

// ─────────────────────────────────────────────────────────────
// STORE MANAGEMENT SERVICES
// ─────────────────────────────────────────────────────────────

export interface CreateStoreInput {
  provider: MarketplaceProviderType
  name: string
  code?: string
  displayName?: string
  externalMerchantId: string
  environment?: MarketplaceEnvironment
  apiKey?: string
  apiSecret?: string
}

export interface UpdateStoreInput {
  name?: string
  displayName?: string
  status?: MarketplaceStoreStatus
  environment?: MarketplaceEnvironment
}

export interface RotateCredentialsInput {
  apiKey: string
  apiSecret: string
}

export async function getMarketplaceStores(): Promise<MarketplaceStore[]> {
  return Array.from(inMemoryStores.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  )
}

export async function getMarketplaceStoreById(
  id: string
): Promise<MarketplaceStore | null> {
  return inMemoryStores.get(id) || null
}

export async function getStoreCredentialById(
  storeId: string
): Promise<MarketplaceCredential | null> {
  return inMemoryCredentials.get(storeId) || null
}

export async function createMarketplaceStore(
  input: CreateStoreInput,
  adminUserId: string
): Promise<MarketplaceStore> {
  const provider = input.provider
  const externalMerchantId = input.externalMerchantId?.trim()
  const environment = input.environment || 'STAGE'

  if (!externalMerchantId) {
    throw new MarketplaceError({
      message: 'Pazaryeri Satıcı / Tedarikçi ID alanı zorunludur.',
      code: 'VALIDATION_ERROR',
      provider,
    })
  }

  // Duplicate merchant protection: Prevent duplicate store registration with same (provider, externalMerchantId, environment)
  const existing = Array.from(inMemoryStores.values()).find(
    (s) =>
      s.provider === provider &&
      s.externalMerchantId === externalMerchantId &&
      s.environment === environment
  )

  if (existing) {
    throw new MarketplaceError({
      message: `Bu ${provider} satıcı ID (${externalMerchantId}) ve ortam (${environment}) için zaten kayıtlı bir mağaza mevcut: "${existing.name}".`,
      code: 'VALIDATION_ERROR',
      provider,
    })
  }

  const id = `store-${provider.toLowerCase().substring(0, 2)}-${Date.now()}`
  const code =
    input.code ||
    `${provider.toLowerCase()}-${Date.now().toString(36).substring(4)}`
  const now = new Date().toISOString()

  const newStore: MarketplaceStore = {
    id,
    provider,
    name: input.name.trim(),
    code,
    displayName: input.displayName?.trim() || input.name.trim(),
    externalMerchantId,
    environment,
    status: 'ACTIVE',
    lastSuccessfulSync: null,
    lastFailedSync: null,
    lastError: null,
    lastConnectionCheck: null,
    createdAt: now,
    updatedAt: now,
  }

  inMemoryStores.set(id, newStore)

  // Store credentials securely with masking
  if (input.apiKey && input.apiSecret) {
    const cred: MarketplaceCredential = {
      id: `cred-${id}`,
      storeId: id,
      apiKeyMasked: '••••••••••••',
      apiKeyEncrypted: `enc_${Buffer.from(input.apiKey).toString('base64')}`,
      apiSecretMasked: '••••••••••••',
      apiSecretEncrypted: `enc_${Buffer.from(input.apiSecret).toString('base64')}`,
      version: 1,
      lastRotatedAt: now,
      createdAt: now,
      updatedAt: now,
    }
    inMemoryCredentials.set(id, cred)
  }

  await logAuditEvent({
    userId: adminUserId,
    action: 'marketplace.store.created',
    entity: 'MarketplaceStore',
    entityId: id,
    metadata: {
      provider,
      name: newStore.name,
      externalMerchantId,
      environment,
    },
  })

  return newStore
}

export async function updateMarketplaceStore(
  id: string,
  input: UpdateStoreInput,
  adminUserId: string
): Promise<MarketplaceStore> {
  const store = inMemoryStores.get(id)
  if (!store) {
    throw new MarketplaceError({
      message: `Mağaza bulunamadı: ${id}`,
      code: 'NOT_FOUND',
      provider: 'HEPSIBURADA',
    })
  }

  const updated: MarketplaceStore = {
    ...store,
    name: input.name?.trim() || store.name,
    displayName: input.displayName?.trim() || store.displayName,
    status: input.status || store.status,
    environment: input.environment || store.environment,
    updatedAt: new Date().toISOString(),
  }

  inMemoryStores.set(id, updated)

  await logAuditEvent({
    userId: adminUserId,
    action: 'marketplace.store.updated',
    entity: 'MarketplaceStore',
    entityId: id,
    metadata: {
      provider: updated.provider,
      name: updated.name,
      status: updated.status,
      environment: updated.environment,
    },
  })

  return updated
}

export async function setStoreStatus(
  id: string,
  status: MarketplaceStoreStatus,
  adminUserId: string
): Promise<MarketplaceStore> {
  const store = inMemoryStores.get(id)
  if (!store) {
    throw new MarketplaceError({
      message: `Mağaza bulunamadı: ${id}`,
      code: 'NOT_FOUND',
      provider: 'HEPSIBURADA',
    })
  }

  store.status = status
  store.updatedAt = new Date().toISOString()
  inMemoryStores.set(id, store)

  await logAuditEvent({
    userId: adminUserId,
    action:
      status === 'ACTIVE'
        ? 'marketplace.store.enabled'
        : 'marketplace.store.disabled',
    entity: 'MarketplaceStore',
    entityId: id,
    metadata: { provider: store.provider, status },
  })

  return store
}

export async function rotateStoreCredentials(
  id: string,
  input: RotateCredentialsInput,
  adminUserId: string
): Promise<{ success: boolean; version: number }> {
  const store = inMemoryStores.get(id)
  if (!store) {
    throw new MarketplaceError({
      message: `Mağaza bulunamadı: ${id}`,
      code: 'NOT_FOUND',
      provider: 'HEPSIBURADA',
    })
  }

  if (!input.apiKey || !input.apiSecret) {
    throw new MarketplaceError({
      message: 'Yeni API anahtarı ve API gizli anahtarı zorunludur.',
      code: 'VALIDATION_ERROR',
      provider: store.provider,
    })
  }

  const existingCred = inMemoryCredentials.get(id)
  const newVersion = (existingCred?.version || 0) + 1
  const now = new Date().toISOString()

  const updatedCred: MarketplaceCredential = {
    id: existingCred?.id || `cred-${id}`,
    storeId: id,
    apiKeyMasked: '••••••••••••',
    apiKeyEncrypted: `enc_${Buffer.from(input.apiKey).toString('base64')}`,
    apiSecretMasked: '••••••••••••',
    apiSecretEncrypted: `enc_${Buffer.from(input.apiSecret).toString('base64')}`,
    version: newVersion,
    lastRotatedAt: now,
    createdAt: existingCred?.createdAt || now,
    updatedAt: now,
  }

  inMemoryCredentials.set(id, updatedCred)

  // Critical rule: Never log plain text secrets to AuditLog
  await logAuditEvent({
    userId: adminUserId,
    action: 'marketplace.credentials.rotated',
    entity: 'MarketplaceCredential',
    entityId: updatedCred.id,
    metadata: {
      storeId: id,
      provider: store.provider,
      version: newVersion,
    },
  })

  return { success: true, version: newVersion }
}

export async function testStoreConnection(
  id: string,
  adminUserId: string
): Promise<ConnectionTestResult> {
  const store = inMemoryStores.get(id)
  if (!store) {
    throw new MarketplaceError({
      message: `Mağaza bulunamadı: ${id}`,
      code: 'NOT_FOUND',
      provider: 'HEPSIBURADA',
    })
  }

  const credential = inMemoryCredentials.get(id)
  const provider = MarketplaceProviderFactory.getProvider(store, credential)

  const result = await provider.testConnection()

  store.lastConnectionCheck = new Date().toISOString()
  if (result.success) {
    store.lastError = null
  } else {
    store.lastError = result.message
  }
  store.updatedAt = new Date().toISOString()
  inMemoryStores.set(id, store)

  await logAuditEvent({
    userId: adminUserId,
    action: 'marketplace.connection.tested',
    entity: 'MarketplaceStore',
    entityId: id,
    metadata: {
      provider: store.provider,
      code: result.code,
      success: result.success,
    },
  })

  return result
}

// ─────────────────────────────────────────────────────────────
// PRODUCT MAPPING SERVICES
// ─────────────────────────────────────────────────────────────

export interface CreateMappingInput {
  storeId: string
  productId: string
  externalSku: string
  externalProductId?: string
  externalBarcode?: string
  externalVariantId?: string
}

export async function getMarketplaceMappings(
  storeId?: string
): Promise<MarketplaceProductMapping[]> {
  const all = Array.from(inMemoryMappings.values())
  if (storeId) {
    return all.filter((m) => m.storeId === storeId)
  }
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function createProductMapping(
  input: CreateMappingInput,
  adminUserId: string
): Promise<MarketplaceProductMapping> {
  const store = inMemoryStores.get(input.storeId)
  if (!store) {
    throw new MarketplaceError({
      message: `Hedef mağaza bulunamadı: ${input.storeId}`,
      code: 'NOT_FOUND',
      provider: 'HEPSIBURADA',
    })
  }

  // Critical rule: STRICT SKU / BARCODE RULE.
  // Marketplace mapping requires explicit SKU alignment. No pure name matching!
  if (!input.externalSku || input.externalSku.trim().length === 0) {
    throw new MarketplaceError({
      message:
        'Pazaryeri Eşleştirmesi için Harici SKU (externalSku) zorunludur. İsim bazlı otomatik eşleştirme kabul edilmez.',
      code: 'VALIDATION_ERROR',
      provider: store.provider,
    })
  }

  // Verify internal product existence
  const product = MOCK_PRODUCTS.find((p) => p.id === input.productId)
  if (!product) {
    throw new MarketplaceError({
      message: `ZUULAB Ürünü bulunamadı: ${input.productId}`,
      code: 'NOT_FOUND',
      provider: store.provider,
    })
  }

  // Prevent duplicate mapping of same external SKU on the same store
  const duplicate = Array.from(inMemoryMappings.values()).find(
    (m) =>
      m.storeId === input.storeId &&
      m.externalSku.toLowerCase() === input.externalSku.trim().toLowerCase()
  )

  if (duplicate) {
    throw new MarketplaceError({
      message: `Bu mağazada "${input.externalSku}" harici SKU'su zaten "${duplicate.productName}" ürünü ile eşleştirilmiş.`,
      code: 'VALIDATION_ERROR',
      provider: store.provider,
    })
  }

  const id = `map-${Date.now()}`
  const now = new Date().toISOString()

  const mapping: MarketplaceProductMapping = {
    id,
    storeId: input.storeId,
    productId: product.id,
    productName: product.name,
    productSku: product.sku,
    productBarcode: (product as any).barcode || null,
    externalProductId: input.externalProductId || null,
    externalSku: input.externalSku.trim(),
    externalBarcode: input.externalBarcode || null,
    externalVariantId: input.externalVariantId || null,
    status: 'MAPPED',
    lastSyncedAt: null,
    createdAt: now,
    updatedAt: now,
  }

  inMemoryMappings.set(id, mapping)

  await logAuditEvent({
    userId: adminUserId,
    action: 'marketplace.mapping.created',
    entity: 'MarketplaceProductMapping',
    entityId: id,
    metadata: {
      storeId: store.id,
      productId: product.id,
      productSku: product.sku,
      externalSku: mapping.externalSku,
    },
  })

  return mapping
}

export async function deleteProductMapping(
  id: string,
  adminUserId: string
): Promise<boolean> {
  const mapping = inMemoryMappings.get(id)
  if (!mapping) return false

  inMemoryMappings.delete(id)

  await logAuditEvent({
    userId: adminUserId,
    action: 'marketplace.mapping.deleted',
    entity: 'MarketplaceProductMapping',
    entityId: id,
    metadata: { storeId: mapping.storeId, externalSku: mapping.externalSku },
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
  const storeMappings = Array.from(inMemoryMappings.values()).filter(
    (m) => m.storeId === storeId
  )

  let matchedCount = 0
  let unmatchedCount = 0

  const reconciledItems: MarketplaceOrderItem[] = []

  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx]
    // Find matching SKU mapping on this specific store
    const mapping = storeMappings.find(
      (m) => m.externalSku.toLowerCase().trim() === it.externalSku.toLowerCase().trim()
    )

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
  const store = inMemoryStores.get(storeId)
  if (!store) {
    throw new MarketplaceError({
      message: `Pazaryeri mağazası bulunamadı: ${storeId}`,
      code: 'NOT_FOUND',
      provider: 'HEPSIBURADA',
    })
  }

  const credential = inMemoryCredentials.get(storeId)
  const provider = MarketplaceProviderFactory.getProvider(store, credential)

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
    const matchingStoreIds = Array.from(inMemoryStores.values())
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
  const store = inMemoryStores.get(storeId)
  if (!store) return null

  if (updates.lastSuccessfulSync !== undefined) {
    store.lastSuccessfulSync = updates.lastSuccessfulSync
  }
  if (updates.lastAttemptedSync !== undefined) {
    store.lastAttemptedSync = updates.lastAttemptedSync
  }
  if (updates.lastSyncCheckpoint !== undefined) {
    store.lastSyncCheckpoint = updates.lastSyncCheckpoint
  }
  if (updates.cursor !== undefined) {
    store.cursor = updates.cursor
  }
  if (updates.windowStart !== undefined) {
    store.windowStart = updates.windowStart
  }
  if (updates.windowEnd !== undefined) {
    store.windowEnd = updates.windowEnd
  }
  if (updates.lastError !== undefined) {
    store.lastError = updates.lastError
  }
  store.updatedAt = new Date().toISOString()

  inMemoryStores.set(storeId, store)
  return store
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
