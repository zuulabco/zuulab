/**
 * Trendyol packages → site orders against the real database, with the Trendyol API
 * stubbed. Everything created here is run-tagged and removed in afterAll.
 */
import 'dotenv/config'
import crypto from 'crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/services/admin.service', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}))

process.env.MARKETPLACE_CREDENTIALS_KEY ||= crypto.randomBytes(32).toString('base64')

const { db } = await import('@/prisma/db')
const mkt = await import('@/lib/services/marketplace/marketplace.service')
const orders = await import('@/lib/services/marketplace/marketplace-orders.service')
const listings = await import('@/lib/services/marketplace/listings.service')

const RUN = `itord${Date.now().toString(36)}`
const ADMIN = 'test-admin'
const BARCODE_LINKED = `${RUN}-linked`
const BARCODE_LATER = `${RUN}-later`

type Pkg = { id: number; orderNumber: string; status: string; barcode: string; quantity: number; unitPrice: number; unitDiscount?: number }

/** The packages Trendyol currently "returns" for this run's seller. */
let packages: Pkg[] = []
let nextId = 9_000_000

function pkg(status: string, barcode: string, quantity = 1, unitPrice = 700, unitDiscount = 0): Pkg {
  nextId++
  return { id: nextId, orderNumber: `${RUN}${nextId}`, status, barcode, quantity, unitPrice, unitDiscount }
}

function toTrendyol(p: Pkg) {
  return {
    id: p.id,
    shipmentPackageId: p.id,
    orderNumber: p.orderNumber,
    status: p.status,
    shipmentPackageStatus: p.status,
    orderDate: Date.now() - 3600_000,
    lastModifiedDate: Date.now(),
    customerFirstName: 'Test',
    customerLastName: 'Alıcı',
    shipmentAddress: { fullName: 'Test Alıcı', fullAddress: 'Deneme Mah. 1', city: 'İzmir', district: 'Bornova', postalCode: '35000', countryCode: 'TR', phone: null },
    invoiceAddress: { fullName: 'Test Alıcı', fullAddress: 'Deneme Mah. 1', city: 'İzmir', district: 'Bornova', countryCode: 'TR' },
    identityNumber: '11111111111',
    cargoProviderName: 'Trendyol Express',
    lines: [
      {
        id: p.id * 10,
        lineId: p.id * 10,
        quantity: p.quantity,
        barcode: p.barcode,
        productName: `Ürün ${p.barcode}`,
        vatRate: 20,
        orderLineItemStatusName: p.status,
        discountDetails: Array.from({ length: p.quantity }, () => ({
          lineItemPrice: p.unitPrice - (p.unitDiscount ?? 0),
          lineItemDiscount: p.unitDiscount ?? 0,
          lineItemSellerDiscount: p.unitDiscount ?? 0,
          lineItemTyDiscount: 0,
        })),
      },
    ],
  }
}

let storeId = ''
let productId = ''
let laterProductId = ''

async function stock(id = productId) {
  return (await db.orm.public.Product.where({ id }).select('stock').first())!.stock
}

async function siteOrderFor(p: Pkg) {
  const mo = await db.orm.public.MarketplaceOrder.where({ storeId, packageId: String(p.id) }).first()
  if (!mo?.orderId) return { mo, order: null }
  return { mo, order: await db.orm.public.Order.where({ id: mo.orderId }).first() }
}

beforeAll(async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = new URL(String(input))
      if (url.pathname.includes('/v2/orders')) {
        const orderNumber = url.searchParams.get('orderNumber')
        const content = packages.filter((p) => !orderNumber || p.orderNumber === orderNumber).map(toTrendyol)
        return new Response(JSON.stringify({ content, totalPages: 1, totalElements: content.length }), { status: 200 })
      }
      return new Response('not stubbed', { status: 500 })
    })
  )

  const store = await mkt.createMarketplaceStore(
    { provider: 'TRENDYOL', name: 'Test Sipariş Mağazası', externalMerchantId: RUN, apiKey: 'k-1234', apiSecret: 's' },
    ADMIN
  )
  storeId = store.id
  const category = (await db.orm.public.Category.select('id').first())!
  for (const [suffix, assign] of [
    ['p', (id: string) => (productId = id)],
    ['q', (id: string) => (laterProductId = id)],
  ] as const) {
    const created = await db.orm.public.Product.create({
      name: `Test ${RUN} ${suffix}`,
      slug: `${RUN}-${suffix}`,
      sku: `${RUN}-${suffix}`.toUpperCase(),
      categoryId: category.id,
      price: '700.00',
      stock: 10,
      isActive: false,
    } as never)
    assign((created as { id: string }).id)
  }
  for (const barcode of [BARCODE_LINKED, BARCODE_LATER]) {
    await db.orm.public.MarketplaceListing.create({
      storeId,
      barcode,
      title: barcode,
      salePrice: '700.00',
      listPrice: '700.00',
      productId: barcode === BARCODE_LINKED ? productId : null,
      matchMethod: barcode === BARCODE_LINKED ? 'MANUAL' : null,
    } as never)
  }
})

afterAll(async () => {
  vi.unstubAllGlobals()
  const run = db.runtime()
  const userEmail = `trendyol.${storeId}@marketplace.invalid`
  const user = await db.orm.public.User.where({ email: userEmail }).select('id').first()
  if (user) {
    await run.execute(db.raw.sql`DELETE FROM orders WHERE user_id = ${user.id}`.affectedCount().build())
    await run.execute(db.raw.sql`DELETE FROM users WHERE id = ${user.id}`.affectedCount().build())
  }
  await run.execute(db.raw.sql`DELETE FROM marketplace_stores WHERE id = ${storeId}`.affectedCount().build())
  await run.execute(db.raw.sql`DELETE FROM products WHERE sku ILIKE ${`${RUN}%`}`.affectedCount().build())
})

describe('Trendyol status and amounts', () => {
  it('maps package statuses to site statuses', () => {
    expect(orders.mapTrendyolStatus('Awaiting')).toBeNull()
    expect(orders.mapTrendyolStatus('Created')).toBe('CONFIRMED')
    expect(orders.mapTrendyolStatus('Invoiced')).toBe('PREPARING')
    expect(orders.mapTrendyolStatus('UnDelivered')).toBe('SHIPPED')
    expect(orders.mapTrendyolStatus('UnPacked')).toBe('CANCELLED')
    expect(orders.mapTrendyolStatus('Returned')).toBe('RETURNED')
    expect(orders.mapTrendyolStatus('Something')).toBeUndefined()
  })

  it('takes the seller discount off but keeps Trendyol-funded discounts', () => {
    const [line] = orders.packageLines({
      id: 1,
      orderNumber: '1',
      status: 'Created',
      orderDate: 0,
      lines: [
        {
          quantity: 2,
          barcode: 'x',
          vatRate: 20,
          discountDetails: [
            { lineItemPrice: 600, lineItemDiscount: 100, lineItemSellerDiscount: 70, lineItemTyDiscount: 30 },
            { lineItemPrice: 600, lineItemDiscount: 100, lineItemSellerDiscount: 70, lineItemTyDiscount: 30 },
          ],
        },
      ],
    })
    expect(line).toMatchObject({ grossTotal: 1400, sellerDiscount: 140, netTotal: 1260, quantity: 2 })
  })
})

describe('order import', { timeout: 60000 }, () => {
  const open = pkg('Created', BARCODE_LINKED, 2, 700, 70)
  const history = pkg('Delivered', BARCODE_LINKED)
  const unlinked = pkg('Created', BARCODE_LATER)
  const awaiting = pkg('Awaiting', BARCODE_LINKED)

  it('first sync: open orders take stock, history does not, unlinked and unpaid wait', async () => {
    packages = [open, history, unlinked, awaiting]
    const result = await orders.syncStoreMarketplaceOrders(storeId)
    expect(result).toMatchObject({ status: 'SUCCESS', packagesRead: 4, ordersCreated: 2, pending: 2, failed: 0 })

    const a = await siteOrderFor(open)
    expect(a.order).toMatchObject({ status: 'CONFIRMED', channel: 'TRENDYOL', stockState: 'COMMITTED' })
    expect(a.order!.orderNumber).toBe(`TY-${open.orderNumber}`)
    expect(Number(a.order!.subtotal)).toBe(1400)
    expect(Number(a.order!.discountAmount)).toBe(140)
    expect(Number(a.order!.total)).toBe(1260)
    expect(Number(a.order!.taxAmount)).toBe(210)
    expect(a.order!.email).toBeNull()
    const items = await db.orm.public.OrderItem.where({ orderId: a.order!.id }).all()
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ productId, quantity: 2 })
    expect(Number(items[0].unitPrice)).toBe(630)

    const h = await siteOrderFor(history)
    expect(h.order).toMatchObject({ status: 'DELIVERED', stockState: 'NONE' })
    expect(h.mo!.affectsStock).toBe(false)

    expect((await siteOrderFor(unlinked)).mo).toMatchObject({ orderId: null, unmatchedCount: 1 })
    expect((await siteOrderFor(awaiting)).mo!.orderId).toBeNull()

    expect(await stock()).toBe(8) // only the open order (2 units)
  })

  it('a repeated sync changes nothing', async () => {
    const result = await orders.syncStoreMarketplaceOrders(storeId)
    expect(result.ordersCreated).toBe(0)
    expect(result.ordersUpdated).toBe(0)
    expect(await stock()).toBe(8)
    const count = await db.orm.public.MarketplaceOrder.where({ storeId }).all()
    expect(count).toHaveLength(4)
  })

  it('follows the marketplace: cancel returns stock, a paid order takes it, new sales take it', async () => {
    open.status = 'Cancelled'
    awaiting.status = 'Created'
    const shippedSinceLastSync = pkg('Shipped', BARCODE_LINKED)
    packages = [open, history, unlinked, awaiting, shippedSinceLastSync]

    const result = await orders.syncStoreMarketplaceOrders(storeId)
    expect(result).toMatchObject({ ordersCreated: 2, ordersUpdated: 1, failed: 0 })

    const cancelled = await siteOrderFor(open)
    expect(cancelled.order).toMatchObject({ status: 'CANCELLED', stockState: 'RELEASED' })
    const history_ = await db.orm.public.OrderStatusHistory.where({ orderId: cancelled.order!.id }).all()
    expect(history_.map((h) => h.status).sort()).toEqual(['CANCELLED', 'CONFIRMED'])

    expect((await siteOrderFor(awaiting)).order).toMatchObject({ status: 'CONFIRMED', stockState: 'COMMITTED' })
    expect((await siteOrderFor(shippedSinceLastSync)).order).toMatchObject({ status: 'SHIPPED', stockState: 'COMMITTED' })
    expect(await stock()).toBe(8) // 8 + 2 (cancel) − 1 (paid) − 1 (shipped)
  })

  it('creates the waiting order once its product is linked', async () => {
    const waiting = await db.orm.public.MarketplaceListing.where({ storeId, barcode: BARCODE_LATER }).first()
    await listings.mapListing(waiting!.id, { productId: laterProductId }, ADMIN)
    const result = await orders.retryPendingMarketplaceOrders(storeId)
    expect(result.created).toBe(1)
    expect((await siteOrderFor(unlinked)).order).toMatchObject({ status: 'CONFIRMED', stockState: 'COMMITTED' })
    expect(await stock(laterProductId)).toBe(9)
  })

  it('records an oversell instead of refusing a sale that already happened', async () => {
    await db.orm.public.Product.where({ id: productId }).update({ stock: 0 } as never)
    const big = pkg('Created', BARCODE_LINKED, 3)
    packages = [...packages, big]
    await orders.syncStoreMarketplaceOrders(storeId)
    expect((await siteOrderFor(big)).order).toMatchObject({ status: 'CONFIRMED', stockState: 'COMMITTED' })
    expect(await stock()).toBe(-3)
  })

  it('lists packages for the admin, waiting ones flagged', async () => {
    const view = await orders.listMarketplaceOrders({ storeId })
    expect(view).toHaveLength(6)
    expect(view.every((o) => o.storeName === 'Test Sipariş Mağazası')).toBe(true)
    expect(view.filter((o) => o.orderNumber).length).toBe(6)
  })
})
