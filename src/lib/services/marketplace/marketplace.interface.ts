export type MarketplaceProviderType = 'HEPSIBURADA' | 'TRENDYOL' | 'AMAZON' | 'EPTTAVM' | 'ETSY'

export type MarketplaceStoreStatus = 'ACTIVE' | 'INACTIVE' | 'ERROR' | 'PENDING'

export type MarketplaceEnvironment = 'STAGE' | 'PRODUCTION'

export type NormalizedMarketplaceStatus =
  | 'NEW'
  | 'APPROVED'
  | 'PREPARING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURNED'
  | 'UNMAPPED'

export type MarketplaceSyncStrategy = 'CURSOR' | 'OFFSET'

export type MarketplaceSyncStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED'

export type MarketplaceMappingStatus = 'MAPPED' | 'PENDING' | 'INACTIVE' | 'ERROR'

export type OrderReconciliationStatus =
  | 'PENDING'
  | 'MATCHED'
  | 'PARTIALLY_MATCHED'
  | 'UNMATCHED'
  | 'ERROR'

export type ItemReconciliationStatus = 'MATCHED' | 'UNMATCHED' | 'PENDING'

export type ItemStockStatus =
  | 'IN_STOCK'
  | 'LOW_STOCK'
  | 'OUT_OF_STOCK'
  | 'UNKNOWN'

export type LabelFormat = 'PDF' | 'ZPL' | 'PNG' | 'JPG'

// ─────────────────────────────────────────────────────────────
// DATA MODELS
// ─────────────────────────────────────────────────────────────

export interface MarketplaceAddress {
  fullName: string
  addressLine1: string
  addressLine2?: string | null
  city: string
  district: string
  postalCode?: string | null
  country: string
  phone?: string | null
}

export interface MarketplaceStore {
  id: string
  provider: MarketplaceProviderType
  name: string
  code: string
  displayName: string
  externalMerchantId: string // HB merchantId, TY supplierId
  environment: MarketplaceEnvironment
  status: MarketplaceStoreStatus
  lastSuccessfulSync: string | null
  lastAttemptedSync?: string | null
  lastFailedSync: string | null
  lastError: string | null
  lastConnectionCheck: string | null
  lastSyncCheckpoint?: string | null
  cursor?: string | null
  windowStart?: string | null
  windowEnd?: string | null
  // Write switches and pricing (DB-backed stores)
  stockSyncEnabled: boolean
  priceSyncEnabled: boolean
  orderImportEnabled: boolean
  /** Marketplace price = site price * (1 + markup / 100) */
  priceMarkupPercent: number
  hasCredentials: boolean
  /** Last 4 characters of the API key, never the key itself */
  credentialHint: string | null
  credentialVersion: number | null
  /** Last stock/price push to the marketplace */
  lastPushAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface MarketplaceCredential {
  id: string
  storeId: string
  apiKeyMasked: string
  apiKeyEncrypted: string
  apiSecretMasked: string
  apiSecretEncrypted: string
  /** Decrypted values, only ever held server-side for outgoing API calls. */
  apiKey: string
  apiSecret: string
  extraConfig?: Record<string, unknown>
  version: number
  lastRotatedAt: string
  createdAt: string
  updatedAt: string
}

export interface MarketplaceProductMapping {
  id: string
  storeId: string
  productId: string
  productName: string
  productSku: string
  productBarcode: string | null
  externalProductId: string | null
  externalSku: string
  externalBarcode: string | null
  externalVariantId: string | null
  status: MarketplaceMappingStatus
  lastSyncedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface MarketplaceOrderItemSnapshot {
  externalLineItemId: string
  externalSku: string
  merchantSku: string | null
  productName: string
  quantity: number
  unitPrice: number
  totalPrice: number
}

export interface MarketplaceOrderSnapshot {
  customerName: string
  customerPhone: string | null
  shippingAddress: MarketplaceAddress
  billingAddress: MarketplaceAddress | null
  externalOrderNumber: string
  orderDate: string
  paymentMethod: string | null
  packageNumber: string | null
  cargoProvider: string | null
  totalAmount: number
  currency: string
  items: MarketplaceOrderItemSnapshot[]
}

export interface MarketplaceOrderItem {
  id: string
  marketplaceOrderId: string
  externalLineItemId: string
  externalSku: string
  externalBarcode: string | null
  merchantSku: string | null
  productId: string | null
  productName: string
  quantity: number
  unitPrice: number
  totalPrice: number
  rawStatus: string
  status: NormalizedMarketplaceStatus
  reconciliationStatus?: ItemReconciliationStatus
  stockStatus?: ItemStockStatus
  createdAt: string
  updatedAt: string
}

export interface MarketplaceOrder {
  id: string
  storeId: string
  externalOrderId: string
  externalOrderNumber: string
  status: NormalizedMarketplaceStatus
  rawStatus: string
  reconciliationStatus?: OrderReconciliationStatus
  orderDate: string
  lastModifiedAt: string
  customerName: string
  customerEmail: string | null
  customerPhone: string | null
  paymentMethod?: string | null
  shippingAddress: MarketplaceAddress
  billingAddress: MarketplaceAddress | null
  cargoProvider: string | null
  cargoTrackingNumber: string | null
  packageNumber: string | null
  totalAmount: number
  currency: string
  rawPayload?: Record<string, unknown>
  snapshot?: MarketplaceOrderSnapshot
  items: MarketplaceOrderItem[]
  unmatchedCount?: number
  syncedAt: string
  createdAt: string
  updatedAt: string
}

export interface MarketplaceSyncJob {
  id: string
  storeId: string
  jobType: 'ORDERS' | 'STOCK' | 'PRODUCTS'
  strategy: MarketplaceSyncStrategy
  status: MarketplaceSyncStatus
  cursor: string | null
  page: number | null
  recordsRead: number
  recordsCreated: number
  recordsUpdated: number
  recordsSkipped: number
  recordsFailed: number
  unmatched?: number
  unchanged?: number
  errorMessage: string | null
  startedAt: string
  finishedAt: string | null
  createdAt: string
}

export interface MarketplaceWebhookEvent {
  id: string
  provider: MarketplaceProviderType
  storeId: string
  eventType: string
  externalOrderId?: string
  packageNumber?: string
  status: string
  payload: Record<string, unknown>
  processed: boolean
  createdAt: string
}

// ─────────────────────────────────────────────────────────────
// PROVIDER CONTRACTS & INPUTS / OUTPUTS
// ─────────────────────────────────────────────────────────────

export interface ConnectionTestResult {
  success: boolean
  latencyMs?: number
  message: string
  code:
    | 'SUCCESS'
    | 'NOT_CONFIGURED'
    | 'INVALID_CREDENTIALS'
    | 'NETWORK_ERROR'
    | 'RATE_LIMITED'
    | 'PROVIDER_ERROR'
  details?: Record<string, unknown>
}

export interface MarketplaceStoreInfo {
  storeName: string
  merchantId: string
  status: string
  currency: string
  defaultCargoCompany?: string
}

export interface FetchOrdersParams {
  startDate?: string
  endDate?: string
  status?: string
  page?: number
  size?: number
  cursor?: string
}

export interface FetchOrdersResult {
  orders: NormalizedMarketplaceOrder[]
  nextCursor?: string | null
  page?: number
  totalCount?: number
  hasMore: boolean
}

export interface NormalizedMarketplaceOrder {
  externalOrderId: string
  externalOrderNumber: string
  status: NormalizedMarketplaceStatus
  rawStatus: string
  orderDate: string
  lastModifiedAt: string
  customerName: string
  customerEmail: string | null
  customerPhone: string | null
  paymentMethod?: string | null
  shippingAddress: MarketplaceAddress
  billingAddress: MarketplaceAddress | null
  cargoProvider: string | null
  cargoTrackingNumber: string | null
  packageNumber: string | null
  totalAmount: number
  currency: string
  rawPayload: Record<string, unknown>
  items: Array<{
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
  }>
}

export interface FetchProductsParams {
  page?: number
  size?: number
  cursor?: string
  approvedOnly?: boolean
}

export interface NormalizedMarketplaceProduct {
  externalProductId: string
  externalSku: string
  externalBarcode: string | null
  title: string
  brand?: string
  stock: number
  salePrice: number
  listPrice?: number
  currency: string
  status: string
  rawPayload: Record<string, unknown>
  /** Model code shared by the same product across stores (Trendyol productMainId) */
  productMainId?: string | null
  stockCode?: string | null
  categoryName?: string | null
  description?: string | null
  imageUrls?: string[]
  attributes?: Array<{ name: string; value: string }>
  vatRate?: number | null
  onSale?: boolean
  archived?: boolean
  productUrl?: string | null
}

export interface FetchProductsResult {
  products: NormalizedMarketplaceProduct[]
  hasMore: boolean
  nextCursor?: string | null
  page?: number
  totalCount?: number
}

export interface StockUpdateItem {
  sku: string
  barcode?: string
  stock: number
}

export type BatchProcessingStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'PARTIAL_SUCCESS'

export interface BatchRequestResult {
  batchId: string
  status: BatchProcessingStatus
  totalItemCount?: number
  successfulItemCount?: number
  failedItemCount?: number
  failureReasons?: Array<{
    identifier?: string
    barcode?: string
    sku?: string
    reason: string
  }>
  rawResponse?: unknown
}

export interface StockUpdateResult {
  success: boolean
  batchId?: string
  updatedItemsCount: number
  failedItemsCount: number
  errors?: Array<{ sku: string; error: string }>
}

export interface PriceUpdateItem {
  sku: string
  salePrice: number
  listPrice?: number
}

export interface PriceUpdateResult {
  success: boolean
  batchId?: string
  updatedItemsCount: number
  failedItemsCount: number
  errors?: Array<{ sku: string; error: string }>
}

export interface FetchShipmentsParams {
  orderId?: string
  packageNumber?: string
}

export interface FetchShipmentsResult {
  shipments: Array<{
    packageNumber: string
    cargoProvider: string
    trackingNumber: string
    trackingUrl?: string
    status: string
  }>
}

export interface LabelResult {
  format: LabelFormat
  data: string // Base64 or binary text
  packageNumber: string
}

export interface UpdateShipmentStatusParams {
  packageNumber: string
  status: 'SHIPPED' | 'DELIVERED'
  trackingNumber: string
  cargoProvider: string
}

export interface ShipmentUpdateResult {
  success: boolean
  message?: string
}

export interface CancelOrderParams {
  orderId: string
  lineItemId?: string
  reasonCode: string
  reasonDescription: string
}

export interface CancelOrderResult {
  success: boolean
  message: string
}

/**
 * Universal Marketplace Provider Interface
 * Isolates all provider-specific HTTP calls, payloads, and protocols
 */
export interface IMarketplaceProvider {
  readonly providerType: MarketplaceProviderType
  readonly syncStrategy: MarketplaceSyncStrategy

  // Operational checks
  testConnection(): Promise<ConnectionTestResult>
  getStoreInfo(): Promise<MarketplaceStoreInfo>

  // Order operations
  fetchOrders(params: FetchOrdersParams): Promise<FetchOrdersResult>
  fetchOrder(externalOrderId: string): Promise<NormalizedMarketplaceOrder>
  normalizeOrder(rawOrder: unknown): NormalizedMarketplaceOrder
  normalizeStatus(rawStatus: string): NormalizedMarketplaceStatus

  // Product & Catalog operations
  fetchProducts(params: FetchProductsParams): Promise<FetchProductsResult>
  fetchProduct(externalProductId: string): Promise<NormalizedMarketplaceProduct>

  // Stock & Price sync
  updateStock(updates: StockUpdateItem[]): Promise<StockUpdateResult>
  updatePrice(updates: PriceUpdateItem[]): Promise<PriceUpdateResult>
  getBatchResult?(batchId: string): Promise<BatchRequestResult>

  // Logistics & Labels
  fetchShipments(params: FetchShipmentsParams): Promise<FetchShipmentsResult>
  fetchLabel(orderId: string, packageId: string, format: LabelFormat): Promise<LabelResult>
  updateShipmentStatus(params: UpdateShipmentStatusParams): Promise<ShipmentUpdateResult>

  // Post-purchase
  cancelOrder(params: CancelOrderParams): Promise<CancelOrderResult>
}
