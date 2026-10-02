/**
 * Stock/price push to Trendyol against the real database, with the Trendyol API
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
const push = await import('@/lib/services/marketplace/listing-push.service')

const RUN = `itpsh${Date.now().toString(36)}`
const ADMIN = 'test-admin'
const LINKED = `${RUN}-linked`
const SECOND = `${RUN}-second`

/** Requests Trendyol "received", and the verdicts it will give per batch. */
const sentBodies: Array<{ items: Array<Record<string, unknown>> }> = []
const verdicts = new Map<string, { status: string; failed?: string[] }>()
let batchCounter = 0

let storeId = ''
let productId = ''

beforeAll(async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/products/price-and-inventory')) {
        sentBodies.push(JSON.parse(String(init?.body)))
        batchCounter++
        return new Response(JSON.stringify({ batchRequestId: `${RUN}-batch-${batchCounter}` }), { status: 200 })
      }
      const batch = /batch-requests\/([^/?]+)/.exec(url)?.[1]
      if (batch) {
        const verdict = verdicts.get(decodeURIComponent(batch)) ?? { status: 'IN_PROGRESS' }
        const last = sentBodies[sentBodies.length - 1]
        return new Response(
          JSON.stringify({
            status: verdict.status,
            items: (last?.items ?? []).map((i) => ({
              requestItem: { barcode: i.barcode },
              status: verdict.failed?.includes(String(i.barcode)) ? 'FAILED' : 'SUCCESS',
              failureReasons: verdict.failed?.includes(String(i.barcode)) ? ['Ürün kilitli'] : [],
            })),
          }),
          { status: 200 }
        )
      }
      return new Response('not stubbed', { status: 500 })
    })
  )

  const store = await mkt.createMarketplaceStore(
    { provider: 'TRENDYOL', name: 'Test Gönderim', externalMerchantId: RUN, apiKey: 'k-9999', apiSecret: 's' },
    ADMIN
  )
  storeId = store.id
  const category = (await db.orm.public.Category.select('id').first())!
  const product = await db.orm.public.Product.create({
    name: `Test ${RUN}`,
    slug: RUN,
    sku: RUN.toUpperCase(),
    categoryId: category.id,
    price: '100.00',
    stock: 7,
    isActive: true,
  } as never)
  productId = (product as { id: string }).id

  const listing = (barcode: string, fields: Record<string, unknown>) =>
    db.orm.public.MarketplaceListing.create({
      storeId,
      barcode,
      title: barcode,
      salePrice: '150.00',
      listPrice: '150.00',
      quantity: 100,
      ...fields,
    } as never)
  await listing(LINKED, { productId, targetSalePrice: '150.00', targetListPrice: '180.00' })
  await listing(SECOND, { productId, targetSalePrice: '160.00', targetListPrice: '160.00' })
  await listing(`${RUN}-unlinked`, { targetSalePrice: '99.00' })
  await listing(`${RUN}-ignored`, { productId, ignored: true })
})

afterAll(async () => {
  vi.unstubAllGlobals()
  const run = db.runtime()
  await run.execute(db.raw.sql`DELETE FROM marketplace_stores WHERE id = ${storeId}`.affectedCount().build())
  await run.execute(db.raw.sql`DELETE FROM products WHERE id = ${productId}`.affectedCount().build())
})

const byBarcode = (plan: Awaited<ReturnType<typeof push.buildStorePushPlan>>, barcode: string) =>
  plan.items.find((i) => i.barcode === barcode)!

describe('marketplace push', { timeout: 60000 }, () => {
  it('sends nothing while the store switches are off', async () => {
    const plan = await push.buildStorePushPlan(storeId)
    expect(plan.toSend).toBe(0)
    expect(byBarcode(plan, LINKED).skipReason).toMatch(/kapalı/)
    const result = await push.pushStoreListings(storeId)
    expect(result.status).toBe('SKIPPED')
    expect(sentBodies).toHaveLength(0)
  })

  it('stock switch: sends only stock, only for linked listings, then nothing until it changes', async () => {
    await mkt.updateMarketplaceStore(storeId, { stockSyncEnabled: true }, ADMIN)
    const plan = await push.buildStorePushPlan(storeId)
    expect(byBarcode(plan, LINKED).send).toEqual({ quantity: 7 })
    expect(byBarcode(plan, `${RUN}-unlinked`).skipReason).toMatch(/bağlı değil/)
    expect(byBarcode(plan, `${RUN}-ignored`).skipReason).toMatch(/Yoksayıldı/)

    const result = await push.pushStoreListings(storeId)
    expect(result).toMatchObject({ status: 'SENT', sent: 2, batches: 1 })
    expect(sentBodies[0].items).toEqual([
      { barcode: LINKED, quantity: 7 },
      { barcode: SECOND, quantity: 7 },
    ])
    const row = await db.orm.public.MarketplaceListing.where({ storeId, barcode: LINKED }).first()
    expect(row!.pushedQuantity).toBe(7)

    // While Trendyol has not answered, nothing is sent again.
    verdicts.set(`${RUN}-batch-1`, { status: 'COMPLETED' })
    expect((await push.pushStoreListings(storeId)).status).toBe('NOTHING_TO_SEND')
    expect(sentBodies).toHaveLength(1)
    const batch = await db.orm.public.MarketplacePushBatch.where({ storeId }).first()
    expect(batch!.status).toBe('COMPLETED')
  })

  it('warns before sending 0 to a listing that shows stock on the marketplace', async () => {
    await db.orm.public.Product.where({ id: productId }).update({ stock: 0 } as never)
    const item = byBarcode(await push.buildStorePushPlan(storeId), LINKED)
    expect(item.send).toEqual({ quantity: 0 })
    expect(item.warning).toMatch(/satıştan düşer/)
    await db.orm.public.Product.where({ id: productId }).update({ stock: 7 } as never)
  })

  it('price switch: sends the store price; a rejected item backs off, then is sent again', async () => {
    await mkt.updateMarketplaceStore(storeId, { priceSyncEnabled: true }, ADMIN)
    const result = await push.pushStoreListings(storeId)
    expect(result.sent).toBe(2)
    expect(sentBodies[1].items).toEqual([
      { barcode: LINKED, salePrice: 150, listPrice: 180 },
      { barcode: SECOND, salePrice: 160, listPrice: 160 },
    ])

    verdicts.set(`${RUN}-batch-2`, { status: 'COMPLETED', failed: [SECOND] })
    const checked = await push.checkPushBatches(storeId)
    expect(checked).toEqual({ checked: 1, failedItems: 1 })
    const rejected = await db.orm.public.MarketplaceListing.where({ storeId, barcode: SECOND }).first()
    expect(rejected!.pushError).toBe('Ürün kilitli')
    expect(rejected!.pushedSalePrice).toBeNull()
    expect(rejected!.pushedQuantity).toBeNull()
    expect((await db.orm.public.MarketplacePushBatch.where({ storeId, status: 'PARTIAL' }).all())).toHaveLength(1)

    expect(byBarcode(await push.buildStorePushPlan(storeId), SECOND).skipReason).toMatch(/reddedildi/)
    const later = new Date(Date.now() + 2 * 60 * 60 * 1000)
    expect(byBarcode(await push.buildStorePushPlan(storeId, later), SECOND).send).toEqual({
      quantity: 7,
      salePrice: 160,
      listPrice: 160,
    })
  })

  it('a batch the marketplace never answers is treated as failed after two hours', async () => {
    await db.orm.public.MarketplaceListing.where({ storeId, barcode: SECOND }).update({ pushError: null, pushErrorAt: null } as never)
    await db.orm.public.Product.where({ id: productId }).update({ stock: 3 } as never)
    await push.pushStoreListings(storeId)
    const pending = (await db.orm.public.MarketplacePushBatch.where({ storeId, status: 'PENDING' }).all())
    expect(pending).toHaveLength(1)
    const result = await push.checkPushBatches(storeId, new Date(Date.now() + 3 * 60 * 60 * 1000))
    expect(result.failedItems).toBe(2)
    const row = await db.orm.public.MarketplaceListing.where({ storeId, barcode: LINKED }).first()
    expect(row!.pushError).toMatch(/yanıt vermedi/)
  })
})
