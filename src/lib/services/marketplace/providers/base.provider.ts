import type {
  IMarketplaceProvider,
  MarketplaceProviderType,
  MarketplaceSyncStrategy,
  ConnectionTestResult,
  MarketplaceStoreInfo,
  FetchOrdersParams,
  FetchOrdersResult,
  NormalizedMarketplaceOrder,
  NormalizedMarketplaceStatus,
  FetchProductsParams,
  FetchProductsResult,
  NormalizedMarketplaceProduct,
  StockUpdateItem,
  StockUpdateResult,
  PriceUpdateItem,
  PriceUpdateResult,
  BatchRequestResult,
  FetchShipmentsParams,
  FetchShipmentsResult,
  LabelFormat,
  LabelResult,
  UpdateShipmentStatusParams,
  ShipmentUpdateResult,
  CancelOrderParams,
  CancelOrderResult,
  MarketplaceStore,
  MarketplaceCredential,
} from '../marketplace.interface'
import { NotImplementedMarketplaceError } from '../marketplace-error'

export abstract class BaseMarketplaceProvider implements IMarketplaceProvider {
  public abstract readonly providerType: MarketplaceProviderType
  public abstract readonly syncStrategy: MarketplaceSyncStrategy

  protected readonly store: MarketplaceStore
  protected readonly credential?: MarketplaceCredential

  constructor(store: MarketplaceStore, credential?: MarketplaceCredential) {
    this.store = store
    this.credential = credential
  }

  // Abstract methods requiring provider-specific implementation
  public abstract testConnection(): Promise<ConnectionTestResult>
  public abstract getStoreInfo(): Promise<MarketplaceStoreInfo>
  public abstract fetchOrders(params: FetchOrdersParams): Promise<FetchOrdersResult>
  public abstract fetchOrder(externalOrderId: string): Promise<NormalizedMarketplaceOrder>
  public abstract normalizeOrder(rawOrder: unknown): NormalizedMarketplaceOrder
  public abstract normalizeStatus(rawStatus: string): NormalizedMarketplaceStatus

  // Base Phase 16 implementations for operations deferred to future phases (explicit NotImplemented)
  public async fetchProducts(params: FetchProductsParams): Promise<FetchProductsResult> {
    throw new NotImplementedMarketplaceError('fetchProducts', this.providerType)
  }

  public async fetchProduct(externalProductId: string): Promise<NormalizedMarketplaceProduct> {
    throw new NotImplementedMarketplaceError('fetchProduct', this.providerType)
  }

  public async updateStock(updates: StockUpdateItem[]): Promise<StockUpdateResult> {
    throw new NotImplementedMarketplaceError('updateStock', this.providerType)
  }

  public async updatePrice(updates: PriceUpdateItem[]): Promise<PriceUpdateResult> {
    throw new NotImplementedMarketplaceError('updatePrice', this.providerType)
  }

  public async getBatchResult(batchId: string): Promise<BatchRequestResult> {
    throw new NotImplementedMarketplaceError('getBatchResult', this.providerType)
  }

  public async fetchShipments(params: FetchShipmentsParams): Promise<FetchShipmentsResult> {
    throw new NotImplementedMarketplaceError('fetchShipments', this.providerType)
  }

  public async fetchLabel(
    orderId: string,
    packageId: string,
    format: LabelFormat
  ): Promise<LabelResult> {
    throw new NotImplementedMarketplaceError('fetchLabel', this.providerType)
  }

  public async updateShipmentStatus(
    params: UpdateShipmentStatusParams
  ): Promise<ShipmentUpdateResult> {
    throw new NotImplementedMarketplaceError('updateShipmentStatus', this.providerType)
  }

  public async cancelOrder(params: CancelOrderParams): Promise<CancelOrderResult> {
    throw new NotImplementedMarketplaceError('cancelOrder', this.providerType)
  }

  /**
   * Sanitizes raw API response payload to ensure no sensitive auth headers,
   * keys, tokens, or plaintext card details are persisted in database
   */
  public sanitizeRawPayload(payload: unknown): Record<string, unknown> {
    if (!payload || typeof payload !== 'object') {
      return {}
    }

    const forbiddenKeys = [
      'authorization',
      'apikey',
      'apisecret',
      'password',
      'token',
      'secret',
      'cvv',
      'pan',
      'cardnumber',
    ]

    const sanitized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase()
      if (forbiddenKeys.some((f) => lowerKey.includes(f))) {
        sanitized[key] = '[REDACTED]'
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeRawPayload(value)
      } else {
        sanitized[key] = value
      }
    }

    return sanitized
  }

  /**
   * Checks whether credentials exist and are properly configured
   */
  protected hasConfiguredCredentials(): boolean {
    if (!this.credential) return false
    return Boolean(
      this.credential.apiKeyEncrypted &&
        this.credential.apiKeyEncrypted.trim().length > 0 &&
        this.credential.apiKeyMasked &&
        this.credential.apiKeyMasked !== 'NOT_SET'
    )
  }
}
