/**
 * Product options, their combinations and measurements against the real database.
 * The product lives in a run-only category and is removed in afterAll.
 */
import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/services/admin.service', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}))

const { db } = await import('@/prisma/db')
const variants = await import('@/lib/services/product-variants.service')
const { quoteCart } = await import('@/lib/services/checkout/pricing.service')
const { loadSnapshot } = await import('@/lib/services/catalog/catalog.service')

const RUN = `itvar${Date.now().toString(36)}`
let categoryId = ''
let productId = ''

const product = () => db.orm.public.Product.select('stock', 'variantOptions', 'lengthMm', 'weightGrams').where({ id: productId }).first()

beforeAll(async () => {
  categoryId = (await db.orm.public.Category.create({ name: `Test ${RUN}`, slug: `test-${RUN}`, isActive: true, sortOrder: 999 } as never)).id
  productId = (
    await db.orm.public.Product.create({
      name: `Test ${RUN}`,
      slug: `test-${RUN}`,
      sku: `TEST-${RUN}`.toUpperCase(),
      price: '300.00' as never,
      taxRate: '20.00' as never,
      stock: 0,
      isActive: true,
      categoryId,
    } as never)
  ).id
}, 60_000)

afterAll(async () => {
  const run = (plan: Parameters<ReturnType<typeof db.runtime>['execute']>[0]) => db.runtime().execute(plan)
  await run(db.raw.sql`DELETE FROM products WHERE id = ${productId}`.affectedCount().build())
  await run(db.raw.sql`DELETE FROM categories WHERE id = ${categoryId}`.affectedCount().build())
  await db.close()
}, 60_000)

describe('product options', () => {
  it('creates one row per combination and sums their stock into the product', async () => {
    const options = [
      { name: 'Renk', values: ['Kırmızı', 'Mavi'] },
      { name: 'Boyut', values: ['S', 'M'] },
    ]
    const saved = await variants.saveProductVariants(productId, {
      options,
      variants: [
        { options: { Renk: 'Kırmızı', Boyut: 'S' }, stock: 3, imageUrl: 'https://example.com/kirmizi.jpg' },
        { options: { Renk: 'Kırmızı', Boyut: 'M' }, stock: 2 },
        { options: { Renk: 'Mavi', Boyut: 'S' }, stock: 0 },
        { options: { Renk: 'Mavi', Boyut: 'M' }, stock: 5 },
      ],
    })
    expect(saved.variants.map((v) => [v.label, v.stock])).toEqual([
      ['Kırmızı / S', 3],
      ['Kırmızı / M', 2],
      ['Mavi / S', 0],
      ['Mavi / M', 5],
    ])
    expect(saved.variants[0].sku).toBe(`TEST-${RUN}-1`.toUpperCase())
    expect((await product())?.stock).toBe(10)
  }, 60_000)

  it('prices a chosen combination and refuses more than its own stock', async () => {
    const { variants: rows } = await variants.getProductVariants(productId)
    const red = rows.find((r) => r.label === 'Kırmızı / M')!
    const q = await quoteCart({ items: [{ productId, variantId: red.id, quantity: 3 }] })
    expect(q.lines[0].unitPrice).toBe(300)
    expect(q.issues[0]?.code).toBe('INSUFFICIENT_STOCK')
  }, 60_000)

  it('keeps ids when values change and switches off combinations that went away', async () => {
    const before = await variants.getProductVariants(productId)
    const redS = before.variants.find((r) => r.label === 'Kırmızı / S')!
    const after = await variants.saveProductVariants(productId, {
      options: [
        { name: 'Renk', values: ['Kırmızı'] },
        { name: 'Boyut', values: ['S', 'M'] },
      ],
      variants: before.variants.filter((r) => r.options.Renk === 'Kırmızı'),
    })
    expect(after.variants.find((r) => r.label === 'Kırmızı / S')?.id).toBe(redS.id)
    expect(after.variants.filter((r) => r.options.Renk === 'Mavi').every((r) => !r.isActive)).toBe(true)
    expect((await product())?.stock).toBe(5)
  }, 60_000)

  it('shows options, photos and summed stock on the storefront', async () => {
    const snap = await loadSnapshot()
    const p = snap.products.find((x) => x.id === productId)!
    expect(p.variantOptions?.[0]).toMatchObject({ name: 'Renk', type: 'color', values: ['Kırmızı'], swatches: { Kırmızı: ['#d32f2f'] } })
    expect(p.variants?.length).toBe(2)
    expect(p.variants?.[0].options).toEqual({ Renk: 'Kırmızı', Boyut: 'S' })
    expect(p.variants?.[0].imageUrl).toBe('https://example.com/kirmizi.jpg')
    expect(p.stock).toBe(5)
  }, 60_000)

  it('keeps colour swatches, fills presets and reads old "Renk" options as colours', () => {
    const [color, size] = variants.normalizeOptions([
      { name: 'Renk', type: 'color', values: ['Kırmızı', 'Gün batımı'], swatches: { 'Gün batımı': ['#F57C00', '#7b1fa2', 'red'] } },
      { name: 'Boyut', type: 'text', values: ['S'] },
    ])
    expect(color.type).toBe('color')
    expect(color.swatches).toEqual({ Kırmızı: ['#d32f2f'], 'Gün batımı': ['#f57c00', '#7b1fa2'] })
    expect(size).toEqual({ name: 'Boyut', type: 'text', values: ['S'] })
    expect(variants.normalizeOptions([{ name: 'Renk', values: ['Mavi'] }])[0]).toMatchObject({ type: 'color', swatches: { Mavi: ['#1e88e5'] } })
    expect(() =>
      variants.normalizeOptions([
        { name: 'Renk', type: 'color', values: ['A'] },
        { name: 'Ton', type: 'color', values: ['B'] },
      ])
    ).toThrow(/tek renk/)
  })

  it('rejects duplicate option names and empty options', async () => {
    await expect(
      variants.saveProductVariants(productId, { options: [{ name: 'Renk', values: ['A'] }, { name: 'renk', values: ['B'] }], variants: [] })
    ).rejects.toThrow(/iki kez/)
    await expect(variants.saveProductVariants(productId, { options: [{ name: 'Renk', values: [] }], variants: [] })).rejects.toThrow(/en az bir/)
  }, 60_000)
})

describe('removing options', () => {
  it('clears the option list so the product page shows no empty option row', async () => {
    const cleared = await variants.saveProductVariants(productId, { options: [], variants: [] })
    expect(cleared.options).toEqual([])
    expect(cleared.variants.every((v) => !v.isActive)).toBe(true)
    expect((await product())?.variantOptions ?? null).toBeNull()
    const p = (await loadSnapshot()).products.find((x) => x.id === productId)!
    expect(p.variantOptions).toBeUndefined()
    expect(p.variants).toEqual([])
  }, 60_000)
})

describe('measurements', () => {
  it('saves size, weight and detail rows', async () => {
    const d = await variants.saveProductDetails(productId, {
      lengthMm: 220,
      widthMm: 220,
      heightMm: 277,
      weightGrams: 410,
      specifications: [{ name: 'Ampul', value: 'E14, dahil değil' }, { name: '', value: 'boş satır atlanır' }],
    })
    expect(d.specifications).toEqual([{ name: 'Ampul', value: 'E14, dahil değil' }])
    const p = await product()
    expect([p?.lengthMm, p?.weightGrams]).toEqual([220, 410])
    await expect(variants.saveProductDetails(productId, { heightMm: -4 })).rejects.toThrow(/Yükseklik/)
  }, 60_000)
})
