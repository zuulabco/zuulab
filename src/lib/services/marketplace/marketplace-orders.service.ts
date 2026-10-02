import 'server-only'
import { db } from '@/prisma/db'
import { dbNumeric } from '@/lib/db/numeric'
import { dbTimestampToIso, toDbTimestamp } from '@/lib/db/time'
import { round2, vatIncluded } from '@/lib/pricing/money'
import { refreshCatalogStock } from '@/lib/cache/catalog-cache'
import { acquireCronLock, releaseCronLock } from '../cron/cron-lock.service'
import { commitOrderStock, releaseOrderStock } from '../checkout/stock.service'
import { logAuditEvent } from '../admin.service'
import { MarketplaceError } from './marketplace-error'
import { getMarketplaceStoreById, getMarketplaceStores, getStoreCredentialById } from './marketplace.service'
import type { MarketplaceProviderType, MarketplaceStore } from './marketplace.interface'
import {
  fetchTrendyolPackages,
  TRENDYOL_MAX_WINDOW_MS,
  type TrendyolAddress,
  type TrendyolPackage,
} from './providers/trendyol-orders'

/**
 * Marketplace orders → site orders.
 *
 * Every package read from the marketplace is kept in `marketplace_orders`. Once all of
 * its lines are linked to site products (marketplace_listings), a site order is created
 * in `orders` (channel = provider), so fulfilment, stock, invoicing and reports treat
 * marketplace and storefront sales the same way. The marketplace is the source of truth
 * for the status; the site order follows it.
 *
 * Stock: a package takes stock once when its site order is created (an oversell is
 * recorded, never refused: the sale already happened) and gives it back when the
 * marketplace cancels it before shipping. Returns are restocked through the returns
 * flow after inspection, never automatically.
 */

type OrderStatus =
  | 'CONFIRMED'
  | 'PREPARING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURNED'

/** Trendyol package status → site order status. null: not an order yet (payment pending). */
export function mapTrendyolStatus(status: string): OrderStatus | null | undefined {
  switch (status) {
    case 'Awaiting':
      return null
    case 'Created':
      return 'CONFIRMED'
    case 'Picking':
    case 'Invoiced':
      return 'PREPARING'
    case 'Shipped':
    case 'AtCollectionPoint':
    case 'UnDelivered':
      return 'SHIPPED'
    case 'Delivered':
      return 'DELIVERED'
    case 'Cancelled':
    case 'UnSupplied':
    case 'UnPacked': // the package was split; its lines moved to new packages
      return 'CANCELLED'
    case 'Returned':
      return 'RETURNED'
    default:
      return undefined
  }
}

const OPEN_STATUSES = new Set(['Awaiting', 'Created', 'Picking', 'Invoiced'])
const NO_STOCK_STATUSES = new Set(['Cancelled', 'UnSupplied', 'UnPacked'])

export interface MarketplaceOrderLine {
  lineId: string
  barcode: string
  stockCode: string | null
  productName: string
  quantity: number
  vatRate: number
  /** Before the seller's discount */
  grossTotal: number
  sellerDiscount: number
  /** What the seller invoices: gross minus seller discount (Trendyol-funded discounts are paid to the seller) */
  netTotal: number
  status: string | null
}

export function packageLines(pkg: TrendyolPackage): MarketplaceOrderLine[] {
  return (pkg.lines ?? []).map((line) => {
    const quantity = Math.max(1, Number(line.quantity) || 1)
    const details = line.discountDetails?.filter((d) => typeof d.lineItemPrice === 'number') ?? []
    let gross: number
    let sellerDiscount: number
    if (details.length > 0) {
      gross = details.reduce((sum, d) => sum + (d.lineItemPrice ?? 0) + (d.lineItemDiscount ?? 0), 0)
      sellerDiscount = details.reduce((sum, d) => sum + (d.lineItemSellerDiscount ?? 0), 0)
    } else {
      gross = (line.lineGrossAmount ?? line.amount ?? line.price ?? 0) * quantity
      sellerDiscount = line.lineSellerDiscount ?? 0
    }
    return {
      lineId: String(line.lineId ?? line.id ?? `${pkg.id}-${line.barcode}`),
      barcode: String(line.barcode ?? ''),
      stockCode: line.stockCode || line.merchantSku || null,
      productName: line.productName || line.barcode || 'Ürün',
      quantity,
      vatRate: typeof line.vatRate === 'number' ? line.vatRate : 20,
      grossTotal: round2(gross),
      sellerDiscount: round2(sellerDiscount),
      netTotal: round2(gross - sellerDiscount),
      status: line.orderLineItemStatusName ?? null,
    }
  })
}

function fullName(a: TrendyolAddress | undefined, fallback: string): string {
  return (a?.fullName || `${a?.firstName ?? ''} ${a?.lastName ?? ''}`.trim() || fallback).trim()
}

function addressText(a: TrendyolAddress | undefined): string {
  if (!a) return ''
  return (
    a.fullAddress ||
    [a.address1, a.address2, a.neighborhood].filter(Boolean).join(' ')
  ).trim()
}

// ─────────────────────────────────────────────────────────────
// Site order creation and status follow-up
// ─────────────────────────────────────────────────────────────

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

type MarketplaceOrderRow = {
  id: string
  storeId: string
  packageId: string
  externalOrderNumber: string
  status: string
  orderDate: unknown
  lastModifiedAt: unknown
  totalAmount: unknown
  customerName: string | null
  cargoProvider: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  lines: unknown
  affectsStock: boolean
  unmatchedCount: number
  orderId: string | null
  lastError: string | null
  createdAt: unknown
}

/** One technical customer per store owns its marketplace orders; it can never sign in or receive mail. */
async function marketplaceCustomerId(store: MarketplaceStore): Promise<string> {
  const email = `${store.provider.toLowerCase()}.${store.id}@marketplace.invalid`
  const existing = await db.orm.public.User.where({ email }).select('id').first()
  if (existing) return existing.id
  try {
    const created = await db.orm.public.User.create({
      email,
      name: `${store.name} müşterileri`,
      role: 'CUSTOMER',
      status: 'MARKETPLACE',
      isActive: false,
      emailVerified: false,
    } as never)
    return (created as { id: string }).id
  } catch {
    // Created concurrently by another sync.
    return (await db.orm.public.User.where({ email }).select('id').first())!.id
  }
}

async function siteOrderNumber(tx: Tx, provider: MarketplaceProviderType, externalOrderNumber: string, packageId: string) {
  const prefix = provider === 'TRENDYOL' ? 'TY' : 'HB'
  const base = `${prefix}-${externalOrderNumber}`
  const taken = await tx.orm.public.Order.where({ orderNumber: base }).select('id').first()
  return taken ? `${base}-${packageId}` : base
}

interface LinkedLine extends MarketplaceOrderLine {
  productId: string
  variantId: string | null
  sku: string
}

async function linkLines(storeId: string, lines: MarketplaceOrderLine[]): Promise<{ linked: LinkedLine[]; unmatched: number }> {
  const listings = await db.orm.public.MarketplaceListing.where({ storeId }).all()
  const byBarcode = new Map(listings.filter((l) => l.productId).map((l) => [l.barcode.toLowerCase(), l]))
  const byStockCode = new Map(
    listings.filter((l) => l.productId && l.stockCode).map((l) => [l.stockCode!.toLowerCase(), l])
  )
  const products = await db.orm.public.Product.select('id', 'sku').all()
  const skuById = new Map(products.map((p) => [p.id, p.sku]))

  const linked: LinkedLine[] = []
  let unmatched = 0
  for (const line of lines) {
    const listing =
      byBarcode.get(line.barcode.toLowerCase()) ?? (line.stockCode ? byStockCode.get(line.stockCode.toLowerCase()) : undefined)
    if (!listing?.productId || !skuById.has(listing.productId)) {
      unmatched++
      continue
    }
    linked.push({ ...line, productId: listing.productId, variantId: listing.variantId, sku: skuById.get(listing.productId)! })
  }
  return { linked, unmatched }
}

async function createSiteOrder(
  store: MarketplaceStore,
  mo: MarketplaceOrderRow,
  pkg: TrendyolPackage | null,
  lines: LinkedLine[],
  status: OrderStatus
): Promise<string | null> {
  const userId = await marketplaceCustomerId(store)
  const subtotal = round2(lines.reduce((s, l) => s + l.grossTotal, 0))
  const discount = round2(lines.reduce((s, l) => s + l.sellerDiscount, 0))
  const total = round2(subtotal - discount)
  const tax = round2(lines.reduce((s, l) => s + vatIncluded(l.netTotal, l.vatRate), 0))
  const ship = pkg?.shipmentAddress
  const invoice = pkg?.invoiceAddress

  const orderId = await db.transaction(async (tx) => {
    const orderNumber = await siteOrderNumber(tx, store.provider, mo.externalOrderNumber, mo.packageId)
    const order = await tx.orm.public.Order.create({
      orderNumber,
      userId,
      status,
      subtotal: dbNumeric(subtotal),
      discountAmount: dbNumeric(discount),
      shippingCost: dbNumeric(0),
      taxAmount: dbNumeric(tax),
      total: dbNumeric(total),
      shipToName: fullName(ship, mo.customerName ?? 'Pazaryeri müşterisi'),
      shipToPhone: ship?.phone ?? '',
      shipToAddress: addressText(ship),
      shipToCity: ship?.city ?? '',
      shipToDistrict: ship?.district ?? '',
      shipToPostal: ship?.postalCode ?? '',
      shipToCountry: ship?.countryCode || 'TR',
      email: null,
      shippingMethod: mo.cargoProvider ?? 'MARKETPLACE',
      billingSnapshot: (invoice
        ? {
            fullName: fullName(invoice, mo.customerName ?? ''),
            company: invoice.company || null,
            addressLine: addressText(invoice),
            city: invoice.city ?? '',
            district: invoice.district ?? '',
            postalCode: invoice.postalCode ?? '',
            country: invoice.countryCode || 'TR',
            taxNumber: pkg?.taxNumber || null,
            identityNumber: pkg?.identityNumber || null,
          }
        : null) as never,
      channel: store.provider,
      stockState: 'NONE',
      paidAt: toDbTimestamp(new Date(dbTimestampToIso(mo.orderDate) ?? Date.now())) as never,
      adminNote: `${store.name} · sipariş ${mo.externalOrderNumber} · paket ${mo.packageId}`,
    } as never)
    const id = (order as { id: string }).id
    for (const line of lines) {
      await tx.orm.public.OrderItem.create({
        orderId: id,
        productId: line.productId,
        variantId: line.variantId,
        productName: line.productName,
        sku: line.sku,
        quantity: line.quantity,
        unitPrice: dbNumeric(round2(line.netTotal / line.quantity)),
        taxRate: dbNumeric(line.vatRate),
        total: dbNumeric(line.netTotal),
      } as never)
    }
    await tx.orm.public.OrderStatusHistory.create({
      orderId: id,
      status,
      note: `${store.name} siparişi içe aktarıldı (${mo.status}).`,
      createdBy: 'marketplace',
    } as never)
    // Claim the package; if another sync got here first, roll this order back.
    const { affectedRows } = await tx.execute(
      db.raw.sql`UPDATE marketplace_orders SET order_id = ${id}, updated_at = now() WHERE id = ${mo.id} AND order_id IS NULL`
        .affectedCount()
        .build()
    )
    if (affectedRows !== 1) throw new Error('MARKETPLACE_ORDER_ALREADY_LINKED')
    return id
  }).catch((err: unknown) => {
    if (err instanceof Error && err.message === 'MARKETPLACE_ORDER_ALREADY_LINKED') return null
    throw err
  })

  if (orderId && mo.affectsStock && status !== 'CANCELLED') {
    const { oversold } = await commitOrderStock(orderId)
    refreshCatalogStock()
    if (oversold) {
      await logAuditEvent({
        action: 'ORDER_OVERSOLD',
        entity: 'Order',
        entityId: orderId,
        metadata: { channel: store.provider, externalOrderNumber: mo.externalOrderNumber },
      })
    }
  }
  return orderId
}

/** Moves the site order to the marketplace's status, recording history; returns stock on cancellation. */
async function followStatus(orderId: string, status: OrderStatus, marketplaceStatus: string): Promise<boolean> {
  const order = await db.orm.public.Order.where({ id: orderId }).select('id', 'status', 'stockState').first()
  if (!order) return false
  if (order.status !== status) {
    await db.transaction(async (tx) => {
      await tx.orm.public.Order.where({ id: orderId }).update({ status } as never)
      await tx.orm.public.OrderStatusHistory.create({
        orderId,
        status,
        note: `Pazaryeri durumu: ${marketplaceStatus}`,
        createdBy: 'marketplace',
      } as never)
    })
  }
  if (status === 'CANCELLED' && order.stockState === 'COMMITTED') {
    await releaseOrderStock(orderId, { includeCommitted: true })
  }
  return order.status !== status
}

/**
 * Creates the site order when possible, or brings it up to the marketplace status.
 * `pkg` carries addresses for creation; without it (a retry from the admin) the
 * package is read again from the marketplace.
 */
async function applyPackage(
  store: MarketplaceStore,
  mo: MarketplaceOrderRow,
  pkg: TrendyolPackage | null
): Promise<'CREATED' | 'UPDATED' | 'UNCHANGED' | 'PENDING'> {
  const status = mapTrendyolStatus(mo.status)
  if (status === undefined) {
    await db.orm.public.MarketplaceOrder.where({ id: mo.id }).update({
      lastError: `Bilinmeyen pazaryeri durumu: ${mo.status}`,
    } as never)
    return 'PENDING'
  }

  if (mo.orderId) {
    if (status === null) return 'UNCHANGED'
    return (await followStatus(mo.orderId, status, mo.status)) ? 'UPDATED' : 'UNCHANGED'
  }

  if (status === null) return 'PENDING' // payment not final on the marketplace yet

  const { linked, unmatched } = await linkLines(store.id, mo.lines as MarketplaceOrderLine[])
  if (unmatched > 0 || linked.length === 0) {
    await db.orm.public.MarketplaceOrder.where({ id: mo.id }).update({
      unmatchedCount: unmatched,
      lastError: `${unmatched} ürün site ürününe bağlı değil; bağlantı kurulunca sipariş oluşturulur.`,
    } as never)
    return 'PENDING'
  }

  const created = await createSiteOrder(store, mo, pkg, linked, status)
  await db.orm.public.MarketplaceOrder.where({ id: mo.id }).update({ unmatchedCount: 0, lastError: null } as never)
  return created ? 'CREATED' : 'UNCHANGED'
}

// ─────────────────────────────────────────────────────────────
// Sync
// ─────────────────────────────────────────────────────────────

export interface OrderSyncResult {
  storeId: string
  storeName: string
  provider: MarketplaceProviderType
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED'
  packagesRead: number
  ordersCreated: number
  ordersUpdated: number
  pending: number
  failed: number
  errorMessage?: string | null
  startedAt: string
  finishedAt: string
}

async function upsertPackage(store: MarketplaceStore, pkg: TrendyolPackage, firstSync: boolean): Promise<MarketplaceOrderRow> {
  const packageId = String(pkg.shipmentPackageId ?? pkg.id)
  const lines = packageLines(pkg)
  const fields = {
    externalOrderNumber: String(pkg.orderNumber),
    status: pkg.shipmentPackageStatus || pkg.status,
    orderDate: toDbTimestamp(new Date(pkg.orderDate)),
    lastModifiedAt: toDbTimestamp(new Date(pkg.lastModifiedDate ?? pkg.orderDate)),
    totalAmount: dbNumeric(round2(lines.reduce((s, l) => s + l.netTotal, 0))),
    customerName: `${pkg.customerFirstName ?? ''} ${pkg.customerLastName ?? ''}`.trim() || null,
    cargoProvider: pkg.cargoProviderName || null,
    trackingNumber: pkg.cargoTrackingNumber ? String(pkg.cargoTrackingNumber) : null,
    trackingUrl: pkg.cargoTrackingLink || null,
    lines: lines as never,
  }
  const existing = (await db.orm.public.MarketplaceOrder.where({ storeId: store.id, packageId }).first()) as MarketplaceOrderRow | null
  if (existing) {
    await db.orm.public.MarketplaceOrder.where({ id: existing.id }).update(fields as never)
    return { ...existing, ...fields, lines } as MarketplaceOrderRow
  }
  // Decided once: history from before the first sync and packages first seen
  // cancelled never move today's stock. Open packages always do: they will leave the shelf.
  const statusNow = fields.status
  const affectsStock = !NO_STOCK_STATUSES.has(statusNow) && (!firstSync || OPEN_STATUSES.has(statusNow))
  await db.orm.public.MarketplaceOrder.create({ storeId: store.id, packageId, ...fields, affectsStock } as never)
  return (await db.orm.public.MarketplaceOrder.where({ storeId: store.id, packageId }).first()) as MarketplaceOrderRow
}

export async function syncStoreMarketplaceOrders(
  storeId: string,
  options: { adminUserId?: string; now?: Date } = {}
): Promise<OrderSyncResult> {
  const store = await getMarketplaceStoreById(storeId)
  if (!store) throw new MarketplaceError({ message: `Mağaza bulunamadı: ${storeId}`, code: 'NOT_FOUND', provider: 'TRENDYOL' })
  const startedAt = new Date().toISOString()
  const base = { storeId: store.id, storeName: store.name, provider: store.provider, startedAt }
  const empty = { packagesRead: 0, ordersCreated: 0, ordersUpdated: 0, pending: 0, failed: 0 }

  if (store.provider !== 'TRENDYOL') {
    return { ...base, ...empty, status: 'SKIPPED', errorMessage: `${store.provider} sipariş aktarımı henüz yok.`, finishedAt: startedAt }
  }

  const lockKey = `marketplace-orders:${store.id}`
  const lock = await acquireCronLock(lockKey, 300)
  if (!lock.acquired) {
    return { ...base, ...empty, status: 'SKIPPED', errorMessage: 'Bu mağaza için sipariş aktarımı zaten çalışıyor.', finishedAt: startedAt }
  }

  const counts = { ...empty }
  try {
    const credential = await getStoreCredentialById(store.id)
    const now = options.now ?? new Date()
    const firstSync = !store.lastSuccessfulSync
    // Re-read two days before the last sync so late status changes are not missed;
    // Trendyol answers at most two weeks per query.
    const since = firstSync
      ? now.getTime() - TRENDYOL_MAX_WINDOW_MS
      : Math.max(new Date(store.lastSuccessfulSync!).getTime() - 2 * 24 * 3600 * 1000, now.getTime() - TRENDYOL_MAX_WINDOW_MS)
    const packages = await fetchTrendyolPackages(store, credential ?? undefined, { startDate: since, endDate: now.getTime() })
    const seen = new Set<string>()
    counts.packagesRead = packages.length

    for (const pkg of packages) {
      try {
        const mo = await upsertPackage(store, pkg, firstSync)
        seen.add(mo.id)
        const outcome = await applyPackage(store, mo, pkg)
        if (outcome === 'CREATED') counts.ordersCreated++
        else if (outcome === 'UPDATED') counts.ordersUpdated++
        else if (outcome === 'PENDING') counts.pending++
      } catch (err) {
        counts.failed++
        console.error(JSON.stringify({ event: 'marketplace.order.failed', store: store.id, package: pkg.id, error: (err as Error).message }))
      }
    }

    // Packages outside the window that are still open or waiting for a link.
    const stale = (await db.orm.public.MarketplaceOrder.where({ storeId: store.id }).all()) as MarketplaceOrderRow[]
    for (const mo of stale) {
      if (seen.has(mo.id)) continue
      const waiting = !mo.orderId && mapTrendyolStatus(mo.status) !== undefined
      const open = OPEN_STATUSES.has(mo.status) || mo.status === 'Shipped' || mo.status === 'UnDelivered'
      if (!waiting && !open) continue
      try {
        const [fresh] = (await fetchTrendyolPackages(store, credential ?? undefined, { orderNumber: mo.externalOrderNumber }))
          .filter((p) => String(p.shipmentPackageId ?? p.id) === mo.packageId)
        if (!fresh) continue
        const updated = await upsertPackage(store, fresh, false)
        const outcome = await applyPackage(store, updated, fresh)
        if (outcome === 'CREATED') counts.ordersCreated++
        else if (outcome === 'UPDATED') counts.ordersUpdated++
        else if (outcome === 'PENDING') counts.pending++
      } catch (err) {
        counts.failed++
        console.error(JSON.stringify({ event: 'marketplace.order.failed', store: store.id, package: mo.packageId, error: (err as Error).message }))
      }
    }

    const finishedAt = new Date().toISOString()
    await db.orm.public.MarketplaceStore.where({ id: store.id }).update({
      lastOrderSyncAt: toDbTimestamp(now),
      lastError: counts.failed > 0 ? `${counts.failed} sipariş paketi işlenemedi.` : null,
    } as never)
    if (options.adminUserId) {
      await logAuditEvent({
        userId: options.adminUserId,
        action: 'marketplace.order.manual_sync',
        entity: 'MarketplaceStore',
        entityId: store.id,
        metadata: { ...counts },
      })
    }
    return { ...base, ...counts, status: counts.failed > 0 ? 'PARTIAL' : 'SUCCESS', errorMessage: null, finishedAt }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await db.orm.public.MarketplaceStore.where({ id: store.id }).update({ lastError: message.slice(0, 1000) } as never)
    return { ...base, ...counts, status: 'FAILED', errorMessage: message, finishedAt: new Date().toISOString() }
  } finally {
    await releaseCronLock(lockKey)
  }
}

export async function syncAllMarketplaceOrders(options: { adminUserId?: string } = {}): Promise<OrderSyncResult[]> {
  const stores = (await getMarketplaceStores()).filter(
    (s) => s.status === 'ACTIVE' && s.orderImportEnabled && s.hasCredentials && s.provider === 'TRENDYOL'
  )
  const results: OrderSyncResult[] = []
  for (const store of stores) results.push(await syncStoreMarketplaceOrders(store.id, options))
  return results
}

/** Retries packages waiting for product links (after linking or importing products). */
export async function retryPendingMarketplaceOrders(
  storeId?: string,
  adminUserId?: string
): Promise<{ checked: number; created: number }> {
  let rows = (await db.orm.public.MarketplaceOrder.all()) as MarketplaceOrderRow[]
  rows = rows.filter((r) => !r.orderId && (!storeId || r.storeId === storeId) && mapTrendyolStatus(r.status))
  let created = 0
  for (const mo of rows) {
    const store = await getMarketplaceStoreById(mo.storeId)
    if (!store) continue
    const credential = await getStoreCredentialById(store.id)
    // Addresses are not stored here; read the package again for them.
    const [pkg] = (await fetchTrendyolPackages(store, credential ?? undefined, { orderNumber: mo.externalOrderNumber }))
      .filter((p) => String(p.shipmentPackageId ?? p.id) === mo.packageId)
    if (!pkg) continue
    const fresh = await upsertPackage(store, pkg, false)
    if ((await applyPackage(store, fresh, pkg)) === 'CREATED') created++
  }
  if (adminUserId) {
    await logAuditEvent({
      userId: adminUserId,
      action: 'marketplace.order.mapping_applied',
      entity: 'MarketplaceOrder',
      metadata: { storeId: storeId ?? 'ALL', checked: rows.length, created },
    })
  }
  return { checked: rows.length, created }
}

// ─────────────────────────────────────────────────────────────
// Admin views
// ─────────────────────────────────────────────────────────────

export interface MarketplaceOrderView {
  id: string
  storeId: string
  storeName: string
  provider: MarketplaceProviderType
  packageId: string
  externalOrderNumber: string
  status: string
  siteStatus: string | null
  orderDate: string | null
  lastModifiedAt: string | null
  totalAmount: number
  customerName: string | null
  cargoProvider: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  lines: MarketplaceOrderLine[]
  affectsStock: boolean
  unmatchedCount: number
  orderId: string | null
  orderNumber: string | null
  lastError: string | null
}

export async function listMarketplaceOrders(
  filters: { storeId?: string; state?: 'ALL' | 'PENDING' | 'IMPORTED'; q?: string } = {}
): Promise<MarketplaceOrderView[]> {
  const stores = new Map((await getMarketplaceStores()).map((s) => [s.id, s]))
  let rows = (await db.orm.public.MarketplaceOrder.all()) as MarketplaceOrderRow[]
  if (filters.storeId) rows = rows.filter((r) => r.storeId === filters.storeId)
  if (filters.state === 'PENDING') rows = rows.filter((r) => !r.orderId)
  if (filters.state === 'IMPORTED') rows = rows.filter((r) => r.orderId)
  if (filters.q) {
    const q = filters.q.trim().toLowerCase()
    rows = rows.filter(
      (r) =>
        r.externalOrderNumber.toLowerCase().includes(q) ||
        r.packageId.includes(q) ||
        (r.customerName ?? '').toLowerCase().includes(q)
    )
  }
  const orderIds = rows.map((r) => r.orderId).filter((id): id is string => Boolean(id))
  const orders = orderIds.length
    ? await db.orm.public.Order.where((o) => o.id.in(orderIds)).select('id', 'orderNumber', 'status').all()
    : []
  const orderById = new Map(orders.map((o) => [o.id, o]))

  return rows
    .map((r): MarketplaceOrderView => {
      const store = stores.get(r.storeId)
      const order = r.orderId ? orderById.get(r.orderId) : undefined
      return {
        id: r.id,
        storeId: r.storeId,
        storeName: store?.name ?? '—',
        provider: store?.provider ?? 'TRENDYOL',
        packageId: r.packageId,
        externalOrderNumber: r.externalOrderNumber,
        status: r.status,
        siteStatus: order?.status ?? null,
        orderDate: dbTimestampToIso(r.orderDate),
        lastModifiedAt: dbTimestampToIso(r.lastModifiedAt),
        totalAmount: Number(r.totalAmount),
        customerName: r.customerName,
        cargoProvider: r.cargoProvider,
        trackingNumber: r.trackingNumber,
        trackingUrl: r.trackingUrl,
        lines: (Array.isArray(r.lines) ? r.lines : []) as MarketplaceOrderLine[],
        affectsStock: r.affectsStock,
        unmatchedCount: r.unmatchedCount,
        orderId: r.orderId,
        orderNumber: order?.orderNumber ?? null,
        lastError: r.lastError,
      }
    })
    .sort((a, b) => (b.orderDate ?? '').localeCompare(a.orderDate ?? ''))
}

export async function getMarketplaceOrderView(id: string): Promise<MarketplaceOrderView | null> {
  return (await listMarketplaceOrders()).find((o) => o.id === id) ?? null
}
