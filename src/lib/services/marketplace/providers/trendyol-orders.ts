import type { MarketplaceCredential, MarketplaceStore } from '../marketplace.interface'
import { marketplaceFetch, marketplaceHeaders } from './marketplace-http'

/**
 * Trendyol shipment packages (orders). Uses the v2 orders endpoint; the v1
 * `/orders` endpoint is retired on 15 October 2026 and returns the same shape.
 * Trendyol limits a query to a two-week window.
 */

export const TRENDYOL_MAX_WINDOW_MS = 14 * 24 * 60 * 60 * 1000
const PAGE_SIZE = 200
const MAX_PAGES = 50

export interface TrendyolAddress {
  firstName?: string
  lastName?: string
  fullName?: string
  company?: string
  address1?: string
  address2?: string
  fullAddress?: string
  city?: string
  district?: string
  neighborhood?: string
  postalCode?: string
  countryCode?: string
  phone?: string | null
}

export interface TrendyolLine {
  id?: number
  lineId?: number
  quantity: number
  barcode?: string
  merchantSku?: string
  stockCode?: string
  sku?: string
  productName?: string
  amount?: number
  lineGrossAmount?: number
  price?: number
  lineUnitPrice?: number
  discount?: number
  lineSellerDiscount?: number
  lineTyDiscount?: number
  vatRate?: number
  orderLineItemStatusName?: string
  discountDetails?: Array<{
    lineItemPrice?: number
    lineItemDiscount?: number
    lineItemSellerDiscount?: number
    lineItemTyDiscount?: number
  }>
}

export interface TrendyolPackage {
  id: number
  shipmentPackageId?: number
  orderNumber: string
  status: string
  shipmentPackageStatus?: string
  orderDate: number
  lastModifiedDate?: number
  grossAmount?: number
  packageGrossAmount?: number
  totalPrice?: number
  packageTotalPrice?: number
  customerFirstName?: string
  customerLastName?: string
  shipmentAddress?: TrendyolAddress
  invoiceAddress?: TrendyolAddress
  taxNumber?: string | null
  identityNumber?: string | null
  cargoProviderName?: string
  cargoTrackingNumber?: number | string
  cargoTrackingLink?: string
  lines: TrendyolLine[]
}

export async function fetchTrendyolPackages(
  store: MarketplaceStore,
  credential: MarketplaceCredential | undefined,
  params: { startDate: number; endDate: number } | { orderNumber: string }
): Promise<TrendyolPackage[]> {
  const headers = marketplaceHeaders(store, credential)
  const sellerId = encodeURIComponent(store.externalMerchantId)
  const filter =
    'orderNumber' in params
      ? `orderNumber=${encodeURIComponent(params.orderNumber)}`
      : `startDate=${params.startDate}&endDate=${params.endDate}`

  const packages: TrendyolPackage[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await marketplaceFetch(
      'TRENDYOL',
      `https://apigw.trendyol.com/integration/order/sellers/${sellerId}/v2/orders?${filter}&page=${page}&size=${PAGE_SIZE}&orderByField=PackageLastModifiedDate&orderByDirection=DESC`,
      { method: 'GET', headers }
    )
    const data = (await res.json()) as { content?: TrendyolPackage[]; totalPages?: number }
    packages.push(...(data.content ?? []))
    if (page + 1 >= (data.totalPages ?? 0)) return packages
  }
  return packages
}
