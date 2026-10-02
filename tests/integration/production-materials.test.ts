/**
 * Print jobs and filament stock against the real database. Rows created here are
 * run-tagged and removed in afterAll.
 */
import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/services/admin.service', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}))

const { db } = await import('@/prisma/db')
const production = await import('@/lib/services/production.service')
const { MaterialService } = await import('@/lib/services/material.service')

const RUN = `itprd${Date.now().toString(36)}`
const USER = { id: 'test-user', email: 'test@example.com' }
let productId = ''
let filamentId = ''

beforeAll(async () => {
  const category = (await db.orm.public.Category.select('id').first())!
  const product = await db.orm.public.Product.create({
    name: `Test ${RUN}`,
    slug: RUN,
    sku: RUN.toUpperCase(),
    categoryId: category.id,
    price: '500.00',
    stock: 2,
    minimumStock: 5,
    estimatedMaterialWeightGrams: 120,
    isActive: true,
  } as never)
  productId = (product as { id: string }).id
})

afterAll(async () => {
  const run = db.runtime()
  await run.execute(db.raw.sql`DELETE FROM production_orders WHERE product_id = ${productId}`.affectedCount().build())
  await run.execute(db.raw.sql`DELETE FROM inventory_transactions WHERE product_id = ${productId}`.affectedCount().build())
  await run.execute(db.raw.sql`DELETE FROM material_stocks WHERE material_name = ${`PLA ${RUN}`}`.affectedCount().build())
  await run.execute(db.raw.sql`DELETE FROM products WHERE id = ${productId}`.affectedCount().build())
})

async function stock() {
  return (await db.orm.public.Product.where({ id: productId }).select('stock').first())!.stock
}

describe('filament', { timeout: 60000 }, () => {
  it('creates a filament with its starting stock as a movement, and refuses duplicates', async () => {
    const created = await MaterialService.createMaterialStock(
      { materialName: `PLA ${RUN}`, color: 'Siyah', quantityGrams: 1000, minimumQuantityGrams: 300, pricePerKgTl: 650 },
      USER
    )
    expect(created.success).toBe(true)
    filamentId = created.stock!.id
    expect(created.stock).toMatchObject({ quantityGrams: 1000, status: 'OK', totalValueTl: 650 })
    const movements = await MaterialService.getMaterialMovements(filamentId)
    expect(movements.map((m) => [m.type, m.quantityGrams])).toEqual([['PURCHASE', 1000]])

    const dup = await MaterialService.createMaterialStock({ materialName: `PLA ${RUN}`, color: 'siyah' }, USER)
    expect(dup.success).toBe(false)
  })

  it('adjusts by delta with a reason; production consumption is not allowed by hand', async () => {
    const r = await MaterialService.adjustMaterialStock(filamentId, { deltaGrams: 500, reason: 'Yeni makara' }, USER)
    expect(r.stock!.quantityGrams).toBe(1500)
    const bad = await MaterialService.adjustMaterialStock(filamentId, { deltaGrams: -10, type: 'PRODUCTION_CONSUMPTION', reason: 'x' }, USER)
    expect(bad.success).toBe(false)
    const again = await MaterialService.adjustMaterialStock(filamentId, { deltaGrams: -500, reason: 'Düzeltme', idempotencyKey: `${RUN}-k` }, USER)
    const repeat = await MaterialService.adjustMaterialStock(filamentId, { deltaGrams: -500, reason: 'Düzeltme', idempotencyKey: `${RUN}-k` }, USER)
    expect(again.stock!.quantityGrams).toBe(1000)
    expect(repeat).toMatchObject({ success: true, idempotent: true })
    expect(repeat.stock!.quantityGrams).toBe(1000)
  })
})

describe('print jobs', { timeout: 60000 }, () => {
  it('reserves filament for open jobs and flags jobs that will run short', async () => {
    const job = await production.createProductionOrder({ productId, quantity: 5, materialStockId: filamentId, createdBy: USER.id })
    expect(job.order).toMatchObject({ status: 'PLANNED', gramsPerUnit: 120, requiredGrams: 600, materialLabel: `PLA ${RUN} Siyah` })
    const big = await production.createProductionOrder({ productId, quantity: 10, createdBy: USER.id })
    // Filament remembered from the product's previous job
    expect(big.order).toMatchObject({ materialStockId: filamentId, requiredGrams: 1200 })

    const filament = await MaterialService.getMaterialStockById(filamentId)
    expect(filament).toMatchObject({ reservedGrams: 1800, freeGrams: -800, status: 'LOW' })
    const readiness = await MaterialService.getMaterialReadiness()
    const short = readiness.shortJobs.find((j) => j.productionOrderId === big.order!.id)
    expect(short?.missingGrams).toBe(800) // the older job takes 600 of 1000 first

    const cancelled = await production.cancelProductionOrder(big.order!.id, 'Fazla', USER.id)
    expect(cancelled.order!.status).toBe('CANCELLED')
    expect((await MaterialService.getMaterialStockById(filamentId))!.reservedGrams).toBe(600)
  })

  it('start → complete deducts filament for every printed piece → stock adds the good ones, once', async () => {
    const [job] = await production.getProductionOrders({ productId, status: 'PLANNED' })
    expect((await production.startProductionOrder(job.id, USER.id)).order!.status).toBe('IN_PROGRESS')
    expect((await production.startProductionOrder(job.id, USER.id)).success).toBe(false)

    const bad = await production.completeProductionOrder(job.id, { completedQuantity: 2, failedQuantity: 3 }, USER.id)
    expect(bad.success).toBe(false)

    const done = await production.completeProductionOrder(job.id, { completedQuantity: 5, failedQuantity: 1 }, USER.id)
    expect(done.order).toMatchObject({ status: 'COMPLETED', acceptedQuantity: 4, materialConsumedGrams: 600 })
    expect((await MaterialService.getMaterialStockById(filamentId))!.quantityGrams).toBe(400)
    const repeat = await production.completeProductionOrder(job.id, { completedQuantity: 5, failedQuantity: 1 }, USER.id)
    expect(repeat.success).toBe(false)
    expect((await MaterialService.getMaterialStockById(filamentId))!.quantityGrams).toBe(400)

    const stocked = await production.stockProductionOrder(job.id, USER.id)
    expect(stocked).toMatchObject({ success: true, newStock: 6, idempotent: false })
    expect(await stock()).toBe(6)
    const twice = await production.stockProductionOrder(job.id, USER.id)
    expect(twice).toMatchObject({ success: true, idempotent: true })
    expect(await stock()).toBe(6)

    const ledger = await db.orm.public.InventoryTransaction.where({ productId }).all()
    expect(ledger.map((l) => [l.type, l.changeQuantity, l.previousStock, l.newStock])).toEqual([['PRODUCTION_STOCK', 4, 2, 6]])
  })

  it('a print where every piece failed ends FAILED and still uses filament', async () => {
    const job = (await production.createProductionOrder({ productId, quantity: 1, gramsPerUnit: 50, createdBy: USER.id })).order!
    await production.startProductionOrder(job.id, USER.id)
    const failed = await production.completeProductionOrder(job.id, { completedQuantity: 1, failedQuantity: 1 }, USER.id)
    expect(failed.order).toMatchObject({ status: 'FAILED', acceptedQuantity: 0 })
    expect((await MaterialService.getMaterialStockById(filamentId))!.quantityGrams).toBe(350)
    expect((await production.stockProductionOrder(job.id, USER.id)).success).toBe(false)
  })

  it('suggests printing products below their minimum, minus what is already being printed', async () => {
    await db.orm.public.Product.where({ id: productId }).update({ stock: 1 } as never)
    let suggestion = (await production.getLowStockProductsForProduction()).find((p) => p.productId === productId)
    expect(suggestion).toMatchObject({ minimumStock: 5, suggestedProductionQty: 9, hasActiveProduction: false })
    await production.createProductionOrder({ productId, quantity: 4, createdBy: USER.id })
    suggestion = (await production.getLowStockProductsForProduction()).find((p) => p.productId === productId)
    expect(suggestion).toMatchObject({ suggestedProductionQty: 5, hasActiveProduction: true })
  })
})
