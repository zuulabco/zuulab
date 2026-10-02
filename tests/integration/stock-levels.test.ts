/**
 * Counted stock levels (single and bulk) and product saves, against the real
 * database. Products created here are run-tagged and removed in afterAll.
 */
import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/services/admin.service', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}))

const { db } = await import('@/prisma/db')
const { adminSetStockLevels } = await import('@/lib/services/inventory-admin.service')
const { adminUpdateProduct } = await import('@/lib/services/catalog-admin.service')

const RUN = `itstk${Date.now().toString(36)}`
const ids: Record<'a' | 'b' | 'v', string> = { a: '', b: '', v: '' }

beforeAll(async () => {
  const category = (await db.orm.public.Category.select('id').first())!
  for (const key of ['a', 'b', 'v'] as const) {
    const created = await db.orm.public.Product.create({
      name: `Test ${RUN} ${key}`,
      slug: `${RUN}-${key}`,
      sku: `${RUN}-${key}`.toUpperCase(),
      categoryId: category.id,
      price: '100.00',
      stock: 5,
      isActive: false,
    } as never)
    ids[key] = (created as { id: string }).id
  }
  await db.orm.public.ProductVariant.create({ productId: ids.v, name: 'Renk', value: 'Mavi', stock: 3 } as never)
})

afterAll(async () => {
  const run = db.runtime()
  await run.execute(db.raw.sql`DELETE FROM inventory_transactions WHERE sku ILIKE ${`${RUN}%`}`.affectedCount().build())
  await run.execute(db.raw.sql`DELETE FROM products WHERE sku ILIKE ${`${RUN}%`}`.affectedCount().build())
})

async function stockOf(id: string) {
  return (await db.orm.public.Product.where({ id }).select('stock').first())!.stock
}

describe('counted stock levels', () => {
  it('sets several products at once and writes a ledger entry per change', async () => {
    const results = await adminSetStockLevels({
      items: [
        { productId: ids.a, stock: 40, expectedStock: 5 },
        { productId: ids.b, stock: 5, expectedStock: 5 },
      ],
      reason: 'Sayım',
      changedBy: 'test',
    })
    expect(results.map((r) => r.status)).toEqual(['UPDATED', 'UNCHANGED'])
    expect(await stockOf(ids.a)).toBe(40)
    const ledger = await db.orm.public.InventoryTransaction.where({ productId: ids.a }).all()
    expect(ledger).toHaveLength(1)
    expect(ledger[0]).toMatchObject({ previousStock: 5, newStock: 40, changeQuantity: 35, type: 'CYCLE_COUNT_ADJUSTMENT' })
    expect(await db.orm.public.InventoryTransaction.where({ productId: ids.b }).all()).toHaveLength(0)
  })

  it('refuses to overwrite a stock that changed since the admin looked (e.g. a sale)', async () => {
    await db.runtime().execute(db.raw.sql`UPDATE products SET stock = stock - 1 WHERE id = ${ids.a}`.affectedCount().build())
    const [result] = await adminSetStockLevels({
      items: [{ productId: ids.a, stock: 40, expectedStock: 40 }],
      reason: 'Sayım',
      changedBy: 'test',
    })
    expect(result).toMatchObject({ status: 'CONFLICT', previousStock: 39 })
    expect(await stockOf(ids.a)).toBe(39)
  })

  it('rejects invalid numbers, unknown products and products with variants', async () => {
    const results = await adminSetStockLevels({
      items: [
        { productId: ids.b, stock: -1 },
        { productId: ids.b, stock: 2.5 },
        { productId: 'missing-product', stock: 1 },
        { productId: ids.v, stock: 9 },
      ],
      reason: '',
      changedBy: 'test',
    })
    expect(results.map((r) => r.status)).toEqual(['INVALID', 'INVALID', 'NOT_FOUND', 'HAS_VARIANTS'])
    expect(await stockOf(ids.v)).toBe(5)
  })

  it('saving the product form never changes stock, and saves the barcode', async () => {
    await adminUpdateProduct(ids.b, { stock: 999, barcode: ` ${RUN}-BC ` } as never, 'test')
    const row = (await db.orm.public.Product.where({ id: ids.b }).select('stock', 'barcode').first())!
    expect(row.stock).toBe(5)
    expect(row.barcode).toBe(`${RUN}-BC`)
    await adminUpdateProduct(ids.b, { barcode: '' }, 'test')
    expect((await db.orm.public.Product.where({ id: ids.b }).select('barcode').first())!.barcode).toBeNull()
  })
})
