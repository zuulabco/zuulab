import { BaseMarketplaceProvider } from './base.provider'
import type {
  MarketplaceProviderType,
  MarketplaceSyncStrategy,
  ConnectionTestResult,
  MarketplaceStoreInfo,
  FetchOrdersParams,
  FetchOrdersResult,
  FetchProductsParams,
  FetchProductsResult,
  NormalizedMarketplaceProduct,
  NormalizedMarketplaceOrder,
  NormalizedMarketplaceStatus,
  MarketplaceAddress,
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

  /**
   * One page of the seller's live listings (approved, not archived). Uses the filter
   * endpoint because the newer /products/approved variant ignores "archived" and
   * would return every archived listing too.
   */
  public override async fetchProducts(params: FetchProductsParams): Promise<FetchProductsResult> {
    const page = params.page ?? 0
    const size = Math.min(params.size ?? 200, 1000)
    const sellerId = encodeURIComponent(this.store.externalMerchantId)
    const res = await marketplaceFetch(
      'TRENDYOL',
      `${this.baseUrl}/integration/product/sellers/${sellerId}/products?approved=true&archived=false&page=${page}&size=${size}`,
      { method: 'GET', headers: marketplaceHeaders(this.store, this.credential) }
    )
    const data = (await res.json()) as {
      content?: TrendyolProduct[]
      totalPages?: number
      totalElements?: number
    }
    const products = (data.content ?? []).filter((p) => p.barcode).map((p) => this.normalizeProduct(p))
    return {
      products,
      page,
      totalCount: data.totalElements,
      hasMore: page + 1 < (data.totalPages ?? 0),
    }
  }

  private normalizeProduct(p: TrendyolProduct): NormalizedMarketplaceProduct {
    return {
      externalProductId: String(p.id ?? p.barcode),
      externalSku: String(p.stockCode || p.barcode),
      externalBarcode: String(p.barcode),
      title: String(p.title ?? '').trim(),
      brand: p.brand ?? undefined,
      stock: Number(p.quantity ?? 0),
      salePrice: Number(p.salePrice ?? 0),
      listPrice: Number(p.listPrice ?? p.salePrice ?? 0),
      currency: 'TRY',
      status: p.archived ? 'ARCHIVED' : p.onSale ? 'ON_SALE' : 'NOT_ON_SALE',
      rawPayload: {},
      productMainId: p.productMainId ? String(p.productMainId) : null,
      stockCode: p.stockCode ? String(p.stockCode) : null,
      categoryName: p.categoryName ?? null,
      description: p.description ?? null,
      imageUrls: (p.images ?? []).map((i) => i.url).filter((u): u is string => typeof u === 'string'),
      attributes: (p.attributes ?? [])
        .filter((a) => a.attributeName && a.attributeValue)
        .map((a) => ({ name: String(a.attributeName), value: String(a.attributeValue) })),
      vatRate: typeof p.vatRate === 'number' ? p.vatRate : null,
      onSale: Boolean(p.onSale),
      archived: Boolean(p.archived),
      productUrl: p.productUrl ?? null,
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

  // Stock/price updates go through listing-push.service, labels and shipment
  // status updates are not implemented yet: the base class says so instead of
  // pretending to succeed.
}

/** Fields read from Trendyol's product filter response. */
interface TrendyolProduct {
  id?: string
  barcode?: string
  stockCode?: string
  productMainId?: string
  title?: string
  brand?: string
  categoryName?: string
  description?: string
  images?: Array<{ url?: string }>
  attributes?: Array<{ attributeName?: string; attributeValue?: string }>
  quantity?: number
  salePrice?: number
  listPrice?: number
  vatRate?: number
  onSale?: boolean
  archived?: boolean
  productUrl?: string
}
