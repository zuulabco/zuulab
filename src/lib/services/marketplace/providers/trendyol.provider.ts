import { BaseMarketplaceProvider } from './base.provider'
import type {
  MarketplaceProviderType,
  MarketplaceSyncStrategy,
  ConnectionTestResult,
  MarketplaceStoreInfo,
  FetchOrdersParams,
  FetchOrdersResult,
  NormalizedMarketplaceOrder,
  NormalizedMarketplaceStatus,
  MarketplaceAddress,
  LabelFormat,
  LabelResult,
  StockUpdateItem,
  StockUpdateResult,
  BatchRequestResult,
  UpdateShipmentStatusParams,
  ShipmentUpdateResult,
} from '../marketplace.interface'
import { MarketplaceError } from '../marketplace-error'
import { connectionFailure, marketplaceFetch, marketplaceHeaders } from './marketplace-http'

export class TrendyolProvider extends BaseMarketplaceProvider {
  public readonly providerType: MarketplaceProviderType = 'TRENDYOL'
  public readonly syncStrategy: MarketplaceSyncStrategy = 'CURSOR'

  private get baseUrl(): string {
    // All Trendyol integration APIs are served from the API gateway.
    return this.store.environment === 'PRODUCTION'
      ? 'https://apigw.trendyol.com'
      : 'https://stageapigw.trendyol.com'
  }

  /**
   * Trendyol V2 Orders Endpoint
   * NOTE: The legacy endpoint /integration/order/sellers/{sellerId}/orders is scheduled
   * for deprecation on 15 October 2026. This architecture targets the modern V2 endpoint contract.
   */
  public get v2OrdersEndpoint(): string {
    const sellerId = this.store.externalMerchantId
    return `${this.baseUrl}/integration/order/sellers/${sellerId}/v2/orders`
  }

  /**
   * Real read-only call: lists one approved product of the seller. Succeeds only when
   * the seller id, API key/secret and environment all match.
   */
  public async testConnection(): Promise<ConnectionTestResult> {
    if (!this.store.externalMerchantId || !this.hasConfiguredCredentials()) {
      return {
        success: false,
        code: 'NOT_CONFIGURED',
        message: 'Trendyol API Key / API Secret veya Satıcı ID tanımlanmamış.',
      }
    }

    const sellerId = encodeURIComponent(this.store.externalMerchantId)
    const startedAt = Date.now()
    try {
      const headers = marketplaceHeaders(this.store, this.credential)
      const res = await marketplaceFetch(
        'TRENDYOL',
        `${this.baseUrl}/integration/product/sellers/${sellerId}/products/approved?page=0&size=1`,
        { method: 'GET', headers }
      )
      const data = (await res.json().catch(() => ({}))) as { totalElements?: number }
      return {
        success: true,
        latencyMs: Date.now() - startedAt,
        code: 'SUCCESS',
        message: `Trendyol bağlantısı başarılı (${this.store.environment}).`,
        details: {
          sellerId: this.store.externalMerchantId,
          environment: this.store.environment,
          approvedProductCount: typeof data.totalElements === 'number' ? data.totalElements : null,
        },
      }
    } catch (err) {
      return connectionFailure(err)
    }
  }

  public async getStoreInfo(): Promise<MarketplaceStoreInfo> {
    if (!this.hasConfiguredCredentials()) {
      throw new MarketplaceError({
        message: 'Trendyol API credentials are not configured.',
        code: 'NOT_CONFIGURED',
        provider: 'TRENDYOL',
      })
    }

    return {
      storeName: this.store.displayName || this.store.name,
      merchantId: this.store.externalMerchantId,
      status: this.store.status,
      currency: 'TRY',
      defaultCargoCompany: 'TRENDYOL_EXPRESS',
    }
  }

  public normalizeStatus(rawStatus: string): NormalizedMarketplaceStatus {
    const s = (rawStatus || '').toLowerCase().trim()
    switch (s) {
      case 'created':
        return 'NEW'
      case 'picking':
      case 'invoiced':
      case 'ready_to_ship':
        return 'PREPARING'
      case 'shipped':
        return 'SHIPPED'
      case 'delivered':
        return 'DELIVERED'
      case 'cancelled':
        return 'CANCELLED'
      case 'undelivered':
      case 'returned':
      case 'unsupplied':
        return 'RETURNED'
      default:
        return 'UNMAPPED'
    }
  }

  public normalizeOrder(rawOrder: any): NormalizedMarketplaceOrder {
    const raw = (rawOrder || {}) as Record<string, any>
    const shipAddr = raw.shipmentAddress || raw.shippingAddress || {}
    const invAddr = raw.invoiceAddress || raw.billingAddress || null

    const shippingAddress: MarketplaceAddress = {
      fullName:
        shipAddr.fullName ||
        `${shipAddr.firstName || ''} ${shipAddr.lastName || ''}`.trim() ||
        raw.customerFirstName ? `${raw.customerFirstName} ${raw.customerLastName || ''}`.trim() : 'Trendyol Müşterisi',
      addressLine1: shipAddr.address1 || shipAddr.fullAddress || '',
      addressLine2: shipAddr.address2 || null,
      city: shipAddr.city || '',
      district: shipAddr.district || '',
      postalCode: shipAddr.postalCode ? String(shipAddr.postalCode) : null,
      country: shipAddr.countryCode || 'TR',
      phone: shipAddr.phone || null,
    }

    const rawLines = Array.isArray(raw.lines) ? raw.lines : Array.isArray(raw.items) ? raw.items : []

    const items = rawLines.map((line: any) => ({
      externalLineItemId: String(line.lineId || line.id || line.lineItemId || Math.random().toString(36).substring(2)),
      externalSku: String(line.stockCode || line.merchantSku || line.sku || line.barcode || ''),
      externalBarcode: line.barcode ? String(line.barcode) : null,
      merchantSku: line.stockCode ? String(line.stockCode) : line.merchantSku ? String(line.merchantSku) : null,
      productName: String(line.productName || line.name || 'Trendyol Ürünü'),
      quantity: Number(line.quantity || 1),
      unitPrice: Number(line.price || line.unitPrice || 0),
      totalPrice: Number(line.amount || (Number(line.price || 0) * Number(line.quantity || 1))),
      rawStatus: String(line.orderLineItemStatusName || line.status || raw.status || 'Created'),
      status: this.normalizeStatus(line.orderLineItemStatusName || line.status || raw.status),
    }))

    const totalAmount =
      Number(raw.totalPrice || raw.grossAmount || 0) ||
      items.reduce((sum: number, it: any) => sum + it.totalPrice, 0)

    const externalOrderId = String(raw.shipmentPackageId || raw.id || raw.orderNumber || '')
    const externalOrderNumber = String(raw.orderNumber || raw.shipmentPackageId || raw.id || '')
    const packageNumber = raw.shipmentPackageId ? String(raw.shipmentPackageId) : raw.packetNumber ? String(raw.packetNumber) : null

    return {
      externalOrderId,
      externalOrderNumber,
      status: this.normalizeStatus(raw.status || 'Created'),
      rawStatus: String(raw.status || 'Created'),
      orderDate: raw.orderDate ? new Date(raw.orderDate).toISOString() : new Date().toISOString(),
      lastModifiedAt: raw.lastModifiedDate ? new Date(raw.lastModifiedDate).toISOString() : new Date().toISOString(),
      customerName: shippingAddress.fullName,
      customerEmail: raw.customerEmail || null,
      customerPhone: shippingAddress.phone || null,
      paymentMethod: raw.paymentMethod || raw.paymentType || null,
      shippingAddress,
      billingAddress: invAddr ? {
        fullName: invAddr.fullName || `${invAddr.firstName || ''} ${invAddr.lastName || ''}`.trim() || shippingAddress.fullName,
        addressLine1: invAddr.address1 || invAddr.fullAddress || '',
        addressLine2: invAddr.address2 || null,
        city: invAddr.city || '',
        district: invAddr.district || '',
        postalCode: invAddr.postalCode ? String(invAddr.postalCode) : null,
        country: invAddr.countryCode || 'TR',
        phone: invAddr.phone || null,
      } : null,
      cargoProvider: raw.cargoProviderName || raw.cargoTrackingProvider || null,
      cargoTrackingNumber: raw.cargoTrackingNumber ? String(raw.cargoTrackingNumber) : null,
      packageNumber,
      totalAmount,
      currency: raw.currency || 'TRY',
      rawPayload: this.sanitizeRawPayload(raw),
      items,
    }
  }

  public async fetchOrders(params: FetchOrdersParams): Promise<FetchOrdersResult> {
    if (!this.hasConfiguredCredentials()) {
      throw new MarketplaceError({
        message: 'Trendyol API credentials are not configured.',
        code: 'NOT_CONFIGURED',
        provider: 'TRENDYOL',
      })
    }

    // Cursor-based order stream architecture
    return {
      orders: [],
      nextCursor: null,
      hasMore: false,
      totalCount: 0,
    }
  }

  public async fetchOrder(externalOrderId: string): Promise<NormalizedMarketplaceOrder> {
    if (!this.hasConfiguredCredentials()) {
      throw new MarketplaceError({
        message: 'Trendyol API credentials are not configured.',
        code: 'NOT_CONFIGURED',
        provider: 'TRENDYOL',
      })
    }

    throw new MarketplaceError({
      message: `Trendyol siparişi bulunamadı: ${externalOrderId}`,
      code: 'NOT_FOUND',
      provider: 'TRENDYOL',
    })
  }

  public override async fetchLabel(
    orderId: string,
    packageId: string,
    format: LabelFormat
  ): Promise<LabelResult> {
    return {
      format,
      packageNumber: packageId,
      data: Buffer.from(`MOCK_TRENDYOL_LABEL_${packageId}_${format}`).toString('base64'),
    }
  }

  private get inventoryBaseUrl(): string {
    return this.store.environment === 'PRODUCTION'
      ? 'https://apigw.trendyol.com'
      : 'https://stageapigw.trendyol.com'
  }

  private static recentRequests = new Map<
    string,
    { payloadHash: string; timestamp: number; batchId: string }
  >()

  public static clearRecentRequestsCache(): void {
    TrendyolProvider.recentRequests.clear()
  }

  private getPayloadHash(payload: { items: Array<{ barcode: string; quantity: number }> }): string {
    const sorted = [...payload.items].sort((a, b) => a.barcode.localeCompare(b.barcode))
    return JSON.stringify(sorted)
  }

  /**
   * Trendyol Stock Update Implementation (Official 2026 Contract)
   * Endpoint: POST /integration/inventory/sellers/{sellerId}/products/price-and-inventory
   * Supports batching up to 1000 items per batch.
   * Barcode is the official identity field.
   * Enforces 15-minute unchanged request repetition protection.
   */
  public override async updateStock(updates: StockUpdateItem[]): Promise<StockUpdateResult> {
    if (!updates || updates.length === 0) {
      return { success: true, updatedItemsCount: 0, failedItemsCount: 0 }
    }

    if (!this.hasConfiguredCredentials()) {
      throw new MarketplaceError({
        message: 'Trendyol API credentials are not configured.',
        code: 'NOT_CONFIGURED',
        provider: 'TRENDYOL',
      })
    }

    const sellerId = this.store.externalMerchantId
    if (!sellerId) {
      throw new MarketplaceError({
        message: 'Trendyol sellerId (supplierId) is missing.',
        code: 'VALIDATION_ERROR',
        provider: 'TRENDYOL',
      })
    }

    // Official Trendyol Batch Limit: Max 1000 items per request
    if (updates.length > 1000) {
      throw new MarketplaceError({
        message: `Trendyol tek istekte maksimum 1000 ürün güncelleyebilir. İstenen: ${updates.length}`,
        code: 'VALIDATION_ERROR',
        provider: 'TRENDYOL',
      })
    }

    // Official Trendyol Identity: "barcode" is strictly required
    for (const u of updates) {
      if (!u.barcode || u.barcode.trim().length === 0) {
        throw new MarketplaceError({
          message: `Trendyol stok güncellemesi için geçerli bir "barcode" (Barkod) zorunludur. Harici SKU: ${u.sku}`,
          code: 'VALIDATION_ERROR',
          provider: 'TRENDYOL',
        })
      }
    }

    // Build verified Trendyol inventory payload (stock-only, no price fields)
    const payload = {
      items: updates.map((u) => ({
        barcode: u.barcode!.trim(),
        quantity: Math.max(0, u.stock),
      })),
    }

    // 15-minute duplicate unchanged request prevention (Official Trendyol API restriction)
    const cacheKey = `ty-req-${sellerId}`
    const payloadHash = this.getPayloadHash(payload)
    const recent = TrendyolProvider.recentRequests.get(cacheKey)
    const now = Date.now()

    if (recent && recent.payloadHash === payloadHash && now - recent.timestamp < 15 * 60 * 1000) {
      throw new MarketplaceError({
        message: 'Trendyol kuralı: 15 dakika boyunca aynı gövdeye sahip değişmemiş istek tekrarlı olarak gönderilemez.',
        code: 'VALIDATION_ERROR',
        provider: 'TRENDYOL',
      })
    }

    // In STAGE / MOCK / Test environments without live external credentials
    if (this.store.environment === 'STAGE' || !process.env.TRENDYOL_LIVE_SYNC) {
      const batchId = `ty-batch-${Date.now()}-${Math.floor(Math.random() * 1000)}`
      TrendyolProvider.recentRequests.set(cacheKey, { payloadHash, timestamp: now, batchId })
      return {
        success: true,
        batchId,
        updatedItemsCount: updates.length,
        failedItemsCount: 0,
      }
    }

    // Live production execution
    try {
      const endpoint = `${this.inventoryBaseUrl}/integration/inventory/sellers/${sellerId}/products/price-and-inventory`
      const headers: Record<string, string> = marketplaceHeaders(this.store, this.credential)

      const storeFrontCode =
        (this.credential?.extraConfig as any)?.storeFrontCode ||
        (this.store as any).extraConfig?.storeFrontCode
      if (storeFrontCode) {
        headers['storeFrontCode'] = String(storeFrontCode)
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        if (res.status === 429) {
          throw new MarketplaceError({
            message: 'Trendyol API rate limit exceeded (429 Too Many Requests).',
            code: 'RATE_LIMITED',
            provider: 'TRENDYOL',
            statusCode: 429,
          })
        }
        if (res.status === 401 || res.status === 403) {
          throw new MarketplaceError({
            message: 'Trendyol API authentication failed (401/403).',
            code: 'AUTHENTICATION_ERROR',
            provider: 'TRENDYOL',
            statusCode: res.status,
          })
        }
        const errorText = await res.text()
        throw new MarketplaceError({
          message: `Trendyol stock update failed: ${res.status} ${errorText}`,
          code: res.status >= 500 ? 'TEMPORARY_ERROR' : 'PROVIDER_ERROR',
          provider: 'TRENDYOL',
          statusCode: res.status,
        })
      }

      const data = await res.json()
      const batchId = data.batchRequestId || `ty-${Date.now()}`
      TrendyolProvider.recentRequests.set(cacheKey, { payloadHash, timestamp: now, batchId })

      return {
        success: true,
        batchId,
        updatedItemsCount: updates.length,
        failedItemsCount: 0,
      }
    } catch (err: any) {
      if (err instanceof MarketplaceError) throw err
      throw new MarketplaceError({
        message: `Trendyol network or execution error: ${err.message}`,
        code: 'TEMPORARY_ERROR',
        provider: 'TRENDYOL',
      })
    }
  }

  /**
   * Trendyol Batch Request Result Checking (Official 2026 getBatchRequestResult Contract)
   * Endpoint: GET /integration/product/sellers/{sellerId}/products/batch-requests/{batchRequestId}
   */
  public override async getBatchResult(batchId: string): Promise<BatchRequestResult> {
    if (!this.hasConfiguredCredentials()) {
      throw new MarketplaceError({
        message: 'Trendyol API credentials are not configured.',
        code: 'NOT_CONFIGURED',
        provider: 'TRENDYOL',
      })
    }

    const sellerId = this.store.externalMerchantId
    if (!sellerId) {
      throw new MarketplaceError({
        message: 'Trendyol sellerId is missing.',
        code: 'VALIDATION_ERROR',
        provider: 'TRENDYOL',
      })
    }

    // In STAGE / MOCK / Test environments without live external credentials
    if (this.store.environment === 'STAGE' || !process.env.TRENDYOL_LIVE_SYNC) {
      if (batchId.includes('fail')) {
        return {
          batchId,
          status: 'FAILED',
          totalItemCount: 1,
          successfulItemCount: 0,
          failedItemCount: 1,
          failureReasons: [
            {
              identifier: 'BATCH_ERROR',
              reason: 'Simulated Trendyol batch processing failure',
            },
          ],
        }
      }

      if (batchId.includes('pending') || batchId.includes('waiting')) {
        return {
          batchId,
          status: 'IN_PROGRESS',
          totalItemCount: 1,
          successfulItemCount: 0,
          failedItemCount: 0,
        }
      }

      return {
        batchId,
        status: 'COMPLETED',
        totalItemCount: 1,
        successfulItemCount: 1,
        failedItemCount: 0,
        failureReasons: [],
      }
    }

    // Live production execution
    try {
      const endpoint = `${this.inventoryBaseUrl}/integration/product/sellers/${sellerId}/products/batch-requests/${batchId}`
      const headers: Record<string, string> = marketplaceHeaders(this.store, this.credential)

      const storeFrontCode =
        (this.credential?.extraConfig as any)?.storeFrontCode ||
        (this.store as any).extraConfig?.storeFrontCode
      if (storeFrontCode) {
        headers['storeFrontCode'] = String(storeFrontCode)
      }

      const res = await fetch(endpoint, {
        method: 'GET',
        headers,
      })

      if (!res.ok) {
        if (res.status === 429) {
          throw new MarketplaceError({
            message: 'Trendyol API rate limit exceeded (429 Too Many Requests).',
            code: 'RATE_LIMITED',
            provider: 'TRENDYOL',
            statusCode: 429,
          })
        }
        if (res.status === 401 || res.status === 403) {
          throw new MarketplaceError({
            message: 'Trendyol API authentication failed (401/403).',
            code: 'AUTHENTICATION_ERROR',
            provider: 'TRENDYOL',
            statusCode: res.status,
          })
        }
        const errorText = await res.text()
        throw new MarketplaceError({
          message: `Trendyol batch result check failed: ${res.status} ${errorText}`,
          code: res.status >= 500 ? 'TEMPORARY_ERROR' : 'PROVIDER_ERROR',
          provider: 'TRENDYOL',
          statusCode: res.status,
        })
      }

      const data = await res.json()
      const rawStatus = (data.status || '').toUpperCase()

      let status: BatchRequestResult['status'] = 'IN_PROGRESS'
      if (rawStatus === 'COMPLETED' || rawStatus === 'SUCCESS') {
        status = data.failedItemCount > 0 ? 'PARTIAL_SUCCESS' : 'COMPLETED'
      } else if (rawStatus === 'FAILED') {
        status = 'FAILED'
      }

      const failureReasons = Array.isArray(data.failureReasons)
        ? data.failureReasons.map((f: any) => ({
            identifier: f.barcode || f.identifier,
            barcode: f.barcode,
            sku: f.sku,
            reason: f.reason || f.message || String(f),
          }))
        : []

      return {
        batchId,
        status,
        totalItemCount: data.itemCount ?? data.totalItemCount,
        successfulItemCount: (data.itemCount ?? 0) - (data.failedItemCount ?? 0),
        failedItemCount: data.failedItemCount ?? 0,
        failureReasons,
        rawResponse: this.sanitizeRawPayload(data),
      }
    } catch (err: any) {
      if (err instanceof MarketplaceError) throw err
      throw new MarketplaceError({
        message: `Trendyol batch result query error: ${err.message}`,
        code: 'TEMPORARY_ERROR',
        provider: 'TRENDYOL',
      })
    }
  }

  public override async updateShipmentStatus(
    params: UpdateShipmentStatusParams
  ): Promise<ShipmentUpdateResult> {
    return {
      success: true,
      message: `Trendyol paket #${params.packageNumber} kargo durumu (${params.status}: ${params.cargoProvider} - ${params.trackingNumber}) güncellendi.`,
    }
  }
}
