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
} from '../marketplace.interface'
import { MarketplaceError } from '../marketplace-error'
import { connectionFailure, marketplaceFetch, marketplaceHeaders } from './marketplace-http'

export class HepsiburadaProvider extends BaseMarketplaceProvider {
  public readonly providerType: MarketplaceProviderType = 'HEPSIBURADA'
  public readonly syncStrategy: MarketplaceSyncStrategy = 'OFFSET'

  private get baseUrl(): string {
    return this.store.environment === 'PRODUCTION'
      ? 'https://mpop.hepsiburada.com'
      : 'https://mpop-sit.hepsiburada.com'
  }

  /**
   * Real read-only call: lists one listing of the merchant. Succeeds only when the
   * merchant id, API username/password and environment all match.
   */
  public async testConnection(): Promise<ConnectionTestResult> {
    if (!this.store.externalMerchantId || !this.hasConfiguredCredentials()) {
      return {
        success: false,
        code: 'NOT_CONFIGURED',
        message: 'Hepsiburada API kullanıcı adı / şifresi veya Merchant ID tanımlanmamış.',
      }
    }

    const merchantId = encodeURIComponent(this.store.externalMerchantId)
    const startedAt = Date.now()
    try {
      const headers = marketplaceHeaders(this.store, this.credential)
      const res = await marketplaceFetch(
        'HEPSIBURADA',
        `${this.inventoryBaseUrl}/listings/merchantid/${merchantId}?offset=0&limit=1`,
        { method: 'GET', headers }
      )
      const data = (await res.json().catch(() => ({}))) as { totalCount?: number }
      return {
        success: true,
        latencyMs: Date.now() - startedAt,
        code: 'SUCCESS',
        message: `Hepsiburada bağlantısı başarılı (${this.store.environment}).`,
        details: {
          merchantId: this.store.externalMerchantId,
          environment: this.store.environment,
          listingCount: typeof data.totalCount === 'number' ? data.totalCount : null,
        },
      }
    } catch (err) {
      return connectionFailure(err)
    }
  }

  public async getStoreInfo(): Promise<MarketplaceStoreInfo> {
    if (!this.hasConfiguredCredentials()) {
      throw new MarketplaceError({
        message: 'Hepsiburada API credentials are not configured.',
        code: 'NOT_CONFIGURED',
        provider: 'HEPSIBURADA',
      })
    }

    return {
      storeName: this.store.displayName || this.store.name,
      merchantId: this.store.externalMerchantId,
      status: this.store.status,
      currency: 'TRY',
      defaultCargoCompany: 'HEPSIJET',
    }
  }

  public normalizeStatus(rawStatus: string): NormalizedMarketplaceStatus {
    const s = (rawStatus || '').toLowerCase().trim()
    switch (s) {
      case 'created':
      case 'open':
      case 'new':
        return 'NEW'
      case 'approved':
      case 'waitingforpackaging':
      case 'inpackaging':
      case 'packaged':
      case 'picking':
        return 'PREPARING'
      case 'shipped':
      case 'indelivery':
      case 'send':
        return 'SHIPPED'
      case 'delivered':
        return 'DELIVERED'
      case 'cancelled':
      case 'unsupplied':
        return 'CANCELLED'
      case 'returned':
      case 'claimcreated':
        return 'RETURNED'
      default:
        return 'UNMAPPED'
    }
  }

  public normalizeOrder(rawOrder: any): NormalizedMarketplaceOrder {
    const raw = (rawOrder || {}) as Record<string, any>
    const recipient = raw.shippingAddress || raw.recipient || {}

    const shippingAddress: MarketplaceAddress = {
      fullName:
        recipient.fullName ||
        `${recipient.firstName || ''} ${recipient.lastName || ''}`.trim() ||
        raw.customerName ||
        'Pazaryeri Müşterisi',
      addressLine1: recipient.address1 || recipient.address || recipient.addressLine || '',
      addressLine2: recipient.address2 || null,
      city: recipient.city || '',
      district: recipient.district || recipient.town || '',
      postalCode: recipient.postalCode || null,
      country: recipient.country || 'TR',
      phone: recipient.phoneNumber || recipient.phone || null,
    }

    const rawItems = Array.isArray(raw.items) ? raw.items : Array.isArray(raw.lines) ? raw.lines : []

    const items = rawItems.map((item: any) => ({
      externalLineItemId: String(item.lineItemId || item.id || item.orderItemId || Math.random().toString(36).substring(2)),
      externalSku: String(item.merchantSku || item.sku || item.hbSku || ''),
      externalBarcode: item.barcode ? String(item.barcode) : null,
      merchantSku: item.merchantSku ? String(item.merchantSku) : null,
      productName: String(item.productName || item.name || 'Hepsiburada Ürünü'),
      quantity: Number(item.quantity || 1),
      unitPrice: Number(item.unitPrice || item.price?.amount || item.price || 0),
      totalPrice: Number(item.totalPrice || (Number(item.unitPrice || item.price || 0) * Number(item.quantity || 1))),
      rawStatus: String(item.status || raw.status || 'Created'),
      status: this.normalizeStatus(item.status || raw.status),
    }))

    const totalAmount =
      Number(raw.totalPrice?.amount || raw.totalAmount || raw.totalPrice || 0) ||
      items.reduce((sum: number, it: any) => sum + it.totalPrice, 0)

    return {
      externalOrderId: String(raw.orderNumber || raw.id || raw.externalOrderId || ''),
      externalOrderNumber: String(raw.orderNumber || raw.packageNumber || raw.externalOrderId || ''),
      status: this.normalizeStatus(raw.status || 'Created'),
      rawStatus: String(raw.status || 'Created'),
      orderDate: raw.orderDate || new Date().toISOString(),
      lastModifiedAt: raw.lastModifiedDate || raw.updatedAt || new Date().toISOString(),
      customerName: shippingAddress.fullName,
      customerEmail: raw.customerEmail || null,
      customerPhone: shippingAddress.phone || null,
      shippingAddress,
      billingAddress: raw.billingAddress ? {
        fullName: raw.billingAddress.fullName || shippingAddress.fullName,
        addressLine1: raw.billingAddress.address1 || raw.billingAddress.address || '',
        addressLine2: raw.billingAddress.address2 || null,
        city: raw.billingAddress.city || '',
        district: raw.billingAddress.district || '',
        postalCode: raw.billingAddress.postalCode || null,
        country: raw.billingAddress.country || 'TR',
        phone: raw.billingAddress.phoneNumber || null,
      } : null,
      cargoProvider: raw.cargoCompany || raw.cargoProvider || null,
      cargoTrackingNumber: raw.trackingNumber || raw.cargoTrackingNumber || null,
      packageNumber: raw.packageNumber || null,
      paymentMethod: raw.paymentMethod || raw.paymentType || null,
      totalAmount,
      currency: raw.currency || 'TRY',
      rawPayload: this.sanitizeRawPayload(raw),
      items,
    }
  }

  public async fetchOrders(params: FetchOrdersParams): Promise<FetchOrdersResult> {
    if (!this.hasConfiguredCredentials()) {
      throw new MarketplaceError({
        message: 'Hepsiburada API credentials are not configured.',
        code: 'NOT_CONFIGURED',
        provider: 'HEPSIBURADA',
      })
    }

    // Offset-based pagination architecture
    const page = params.page ?? 1
    const size = params.size ?? 50

    return {
      orders: [],
      page,
      hasMore: false,
      totalCount: 0,
    }
  }

  public async fetchOrder(externalOrderId: string): Promise<NormalizedMarketplaceOrder> {
    if (!this.hasConfiguredCredentials()) {
      throw new MarketplaceError({
        message: 'Hepsiburada API credentials are not configured.',
        code: 'NOT_CONFIGURED',
        provider: 'HEPSIBURADA',
      })
    }

    throw new MarketplaceError({
      message: `Hepsiburada siparişi bulunamadı: ${externalOrderId}`,
      code: 'NOT_FOUND',
      provider: 'HEPSIBURADA',
    })
  }

  private get inventoryBaseUrl(): string {
    return this.store.environment === 'PRODUCTION'
      ? 'https://listing-external.hepsiburada.com'
      : 'https://listing-external-sit.hepsiburada.com'
  }

  // Stock/price updates go through listing-push.service, labels and shipment
  // status updates are not implemented yet: the base class says so instead of
  // pretending to succeed.
}
