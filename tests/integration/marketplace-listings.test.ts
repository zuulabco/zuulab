/**
 * Marketplace listings: reading, automatic/manual linking, store prices and importing
 * as site products, against the real database. Trendyol and Cloudinary are stubbed;
 * every row created here is run-tagged and removed in afterAll.
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
const listings = await import('@/lib/services/marketplace/listings.service')

const RUN = `itlst${Date.now().toString(36)}`
const ADMIN = 'test-admin'
const model = (name: string) => `${RUN}-${name}`

type Item = { barcode: string; productMainId: string; title: string; salePrice: number; quantity?: number }

// What each fake store currently "sells" on Trendyol, keyed by seller id.
const catalog = new Map<string, Item[]>()

function trendyolPage(sellerId: string) {
  const items = catalog.get(sellerId) ?? []
  return {
    page: 0,
    size: 200,
    totalElements: items.length,
    totalPages: 1,
    content: items.map((i) => ({
      id: `id-${i.barcode}`,
      barcode: i.barcode,
      productMainId: i.productMainId,
      title: i.title,
      brand: 'Zuulab',
      categoryName: 'Masa ve Gece Lambası',
      description: '<p>Açıklama &amp; detay</p>',
      images: [{ url: `https://cdn.dsmcdn.com/${i.barcode}.jpg` }],
      attributes: [{ attributeName: 'Renk', attributeValue: 'Beyaz' }],
      quantity: i.quantity ?? 100,
      salePrice: i.salePrice,
      listPrice: i.salePrice,
      vatRate: 20,
      onSale: true,
      archived: false,
      productUrl: `https://www.trendyol.com/x-p-${i.barcode}`,
    })),
  }
}

let storeA: { id: string }
let storeB: { id: string }

beforeAll(async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.includes('api.cloudinary.com')) {
        return new Response(JSON.stringify({ error: { message: 'test: no upload' } }), { status: 400 })
      }
      const seller = /sellers\/([^/]+)\/products/.exec(url)?.[1]
      if (seller) return new Response(JSON.stringify(trendyolPage(decodeURIComponent(seller))), { status: 200 })
      return new Response('not stubbed', { status: 500 })
    })
  )
  storeA = await mkt.createMarketplaceStore(
    { provider: 'TRENDYOL', name: 'Test A', externalMerchantId: `${RUN}A`, apiKey: 'k-AAAA', apiSecret: 's' },
    ADMIN
  )
  storeB = await mkt.createMarketplaceStore(
    { provider: 'TRENDYOL', name: 'Test B', externalMerchantId: `${RUN}B`, apiKey: 'k-BBBB', apiSecret: 's' },
    ADMIN
  )
  catalog.set(`${RUN}A`, [
    { barcode: `${RUN}-a1`, productMainId: model('lamp'), title: `Zuulight ${RUN} Lamba`, salePrice: 2000 },
    { barcode: `${RUN}-a2`, productMainId: model('cube'), title: `Loops ${RUN} Küp`, salePrice: 150 },
    { barcode: `${RUN}-a3`, productMainId: model('gone'), title: `Eski ${RUN} Ürün`, salePrice: 90 },
  ])
  catalog.set(`${RUN}B`, [
    { barcode: `${RUN}-b1`, productMainId: model('lamp'), title: `Zuulight ${RUN} Lamba`, salePrice: 1500 },
  ])
})

afterAll(async () => {
  vi.unstubAllGlobals()
  const run = db.runtime()
  await run.execute(db.raw.sql`DELETE FROM marketplace_stores WHERE external_seller_id LIKE ${`${RUN}%`}`.affectedCount().build())
  await run.execute(db.raw.sql`DELETE FROM products WHERE sku ILIKE ${`${RUN}%`}`.affectedCount().build())
})

async function rows(storeId: string) {
  return db.orm.public.MarketplaceListing.where({ storeId }).all()
}

describe('marketplace listings', () => {
  it('reads listings and keeps the marketplace price as the store price', async () => {
    const result = await listings.refreshStoreListings(storeA.id, ADMIN)
    expect(result).toMatchObject({ fetched: 3, created: 3, updated: 0, archived: 0 })
    await listings.refreshStoreListings(storeB.id, ADMIN)

    const lamp = (await rows(storeA.id)).find((r) => r.barcode === `${RUN}-a1`)!
    expect(Number(lamp.salePrice)).toBe(2000)
    expect(Number(lamp.targetSalePrice)).toBe(2000)
    expect(lamp.productMainId).toBe(model('lamp'))
    expect(lamp.productId).toBeNull()
  })

  it('a second read updates, archives what disappeared and never touches our price', async () => {
    const lamp = (await rows(storeA.id)).find((r) => r.barcode === `${RUN}-a1`)!
    await listings.setListingTargetPrice(lamp.id, { salePrice: 1999 }, ADMIN)

    catalog.set(`${RUN}A`, catalog.get(`${RUN}A`)!.filter((i) => i.productMainId !== model('gone')).map((i) =>
      i.productMainId === model('lamp') ? { ...i, salePrice: 2100, quantity: 7 } : i
    ))
    const result = await listings.refreshStoreListings(storeA.id, ADMIN)
    expect(result).toMatchObject({ fetched: 2, created: 0, updated: 2, archived: 1 })

    const after = await rows(storeA.id)
    const updatedLamp = after.find((r) => r.barcode === `${RUN}-a1`)!
    expect(Number(updatedLamp.salePrice)).toBe(2100)
    expect(updatedLamp.quantity).toBe(7)
    expect(Number(updatedLamp.targetSalePrice)).toBe(1999)
    expect(after.find((r) => r.barcode === `${RUN}-a3`)!.archived).toBe(true)
  })

  it('imports one draft product per model code and links every store', async () => {
    const view = await listings.getListings({ filter: 'UNMAPPED' })
    const lampA = view.find((l) => l.barcode === `${RUN}-a1`)!
    const result = await listings.importListingsAsProducts([lampA.id], ADMIN)

    expect(result.created).toHaveLength(1)
    expect(result.created[0].listings).toBe(2) // store A and store B
    expect(result.imageWarnings.length).toBeGreaterThan(0) // Cloudinary stubbed to fail

    const product = (await db.orm.public.Product.where({ id: result.created[0].productId }).first())!
    expect(product.isActive).toBe(false)
    expect(product.stock).toBe(0)
    expect(Number(product.price)).toBe(1500) // lowest current marketplace price
    expect(product.description).toBe('Açıklama & detay')
    const category = await db.orm.public.Category.where({ id: product.categoryId }).first()
    expect(category!.slug).toBe('aydinlatmalar')
    const specs = await db.orm.public.ProductSpecification.where({ productId: product.id }).all()
    expect(specs.map((s) => `${s.name}=${s.value}`)).toEqual(['Renk=Beyaz'])

    const linked = (await db.orm.public.MarketplaceListing.where({ productMainId: model('lamp') }).all())
    expect(linked.every((l) => l.productId === product.id && l.matchMethod === 'IMPORT')).toBe(true)

    const again = await listings.importListingsAsProducts([lampA.id], ADMIN)
    expect(again.created).toHaveLength(0)
    expect(again.skipped[0].reason).toMatch(/bağlı/)
  })

  it('links by model code automatically when a new store lists a linked product', async () => {
    const lamp = (await db.orm.public.MarketplaceListing.where({ productMainId: model('lamp') }).first())!
    catalog.set(`${RUN}B`, [
      ...catalog.get(`${RUN}B`)!,
      { barcode: `${RUN}-b2`, productMainId: model('lamp'), title: 'Farklı başlık', salePrice: 1400 },
    ])
    const result = await listings.refreshStoreListings(storeB.id, ADMIN)
    expect(result.autoMapped).toBe(1)
    const b2 = (await rows(storeB.id)).find((r) => r.barcode === `${RUN}-b2`)!
    expect(b2.productId).toBe(lamp.productId)
    expect(b2.matchMethod).toBe('MODEL_CODE')
  })

  it('manual link, unlink and ignore; mappings feed the existing services', async () => {
    const lampProductId = (await db.orm.public.MarketplaceListing.where({ productMainId: model('lamp') }).first())!.productId!
    const cube = (await rows(storeA.id)).find((r) => r.barcode === `${RUN}-a2`)!

    await listings.mapListing(cube.id, { productId: lampProductId }, ADMIN)
    let mappings = await mkt.getMarketplaceMappings(storeA.id)
    expect(mappings.find((m) => m.externalBarcode === `${RUN}-a2`)?.productId).toBe(lampProductId)

    await listings.mapListing(cube.id, { productId: null }, ADMIN)
    mappings = await mkt.getMarketplaceMappings(storeA.id)
    expect(mappings.find((m) => m.externalBarcode === `${RUN}-a2`)).toBeUndefined()

    await listings.setListingIgnored(cube.id, true, ADMIN)
    expect((await listings.getListings({ storeId: storeA.id, filter: 'IGNORED' })).map((l) => l.barcode)).toEqual([`${RUN}-a2`])
    await expect(listings.mapListing('missing', { productId: lampProductId }, ADMIN)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rejects invalid store prices', async () => {
    const lamp = (await rows(storeA.id)).find((r) => r.barcode === `${RUN}-a1`)!
    await expect(listings.setListingTargetPrice(lamp.id, { salePrice: 0 }, ADMIN)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    await listings.setListingTargetPrice(lamp.id, { salePrice: 1800, listPrice: 1500 }, ADMIN)
    const after = (await db.orm.public.MarketplaceListing.where({ id: lamp.id }).first())!
    expect(Number(after.targetListPrice)).toBe(1800) // list price never below sale price
  })
})
