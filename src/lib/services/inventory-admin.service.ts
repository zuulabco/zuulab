import 'server-only'
import { db } from '@/prisma/db'
import { dbTimestampToIso } from '@/lib/db/time'
import { invalidateCatalog } from '@/lib/cache/catalog-cache'
import { enqueueStockSyncForProducts } from './marketplace/stock-sync.service'
import { logAuditEvent } from './admin.service'

/**
 * Admin stock view and manual adjustments.
 *
 * products.stock is the sellable quantity (storefront and checkout use it).
 * Checkout takes stock immediately, so units held by orders awaiting payment are
 * already subtracted; `reserved` reports them so `stock` (physical) =
 * available + reserved.
 */

export interface InventoryMovement {
  id: string
  productId: string
  productName: string
  previousStock: number
  newStock: number
  quantityChange: number
  movementType: 'RESTOCK' | 'MANUAL_ADJUSTMENT' | 'SALE' | 'RETURN' | 'CORRECTION'
  reason: string
  changedBy: string
  createdAt: string
}

const TRANSACTION_TYPE: Record<InventoryMovement['movementType'], 'MANUAL_ADJUSTMENT' | 'RETURN_RESTOCK' | 'INITIAL_STOCK' | 'CYCLE_COUNT_ADJUSTMENT'> = {
  RESTOCK: 'MANUAL_ADJUSTMENT',
  MANUAL_ADJUSTMENT: 'MANUAL_ADJUSTMENT',
  SALE: 'MANUAL_ADJUSTMENT',
  RETURN: 'RETURN_RESTOCK',
  CORRECTION: 'CYCLE_COUNT_ADJUSTMENT',
}

/** Units held by unpaid orders, per product (variant lines count toward their product). */
async function heldByProduct(): Promise<Map<string, number>> {
  const held = await db.orm.public.Order.select('id').where({ stockState: 'HELD' }).all()
  if (held.length === 0) return new Map()
  const items = await db.orm.public.OrderItem
    .select('productId', 'quantity')
    .where((i) => i.orderId.in(held.map((o) => o.id)))
    .all()
  const map = new Map<string, number>()
  for (const i of items) map.set(i.productId, (map.get(i.productId) ?? 0) + i.quantity)
  return map
}

/**
 * Retrieves stock breakdown for all products
 */
export async function adminGetInventoryOverview() {
  const [products, categories, reserved] = await Promise.all([
    db.orm.public.Product.orderBy((p) => p.name.asc()).all(),
    db.orm.public.Category.select('id', 'name').all(),
    heldByProduct(),
  ])
  const categoryName = new Map(categories.map((c) => [c.id, c.name]))

  return products.map((p) => {
    const available = p.stock
    const held = reserved.get(p.id) ?? 0
    const threshold = p.lowStockThreshold || 5
    const status = available <= 0 ? 'OUT_OF_STOCK' : available <= threshold ? 'LOW_STOCK' : 'IN_STOCK'
    return {
      productId: p.id,
      productName: p.name,
      sku: p.sku,
      category: categoryName.get(p.categoryId) ?? p.categoryId,
      isActive: p.isActive,
      stock: available + held,
      reserved: held,
      available,
      lowStockThreshold: threshold,
      status,
    }
  })
}

/**
 * Manually adjusts a product's stock by a relative amount.
 *
 * The row is locked and changed relative to its current value inside one
 * transaction, so an adjustment can never overwrite a checkout that ran at the
 * same moment (a read-then-write of the absolute value would). Stock never goes
 * below zero.
 */
export async function adminAdjustStock(params: {
  productId: string
  quantityChange: number
  movementType: InventoryMovement['movementType']
  reason: string
  changedBy: string
}) {
  const delta = Math.trunc(Number(params.quantityChange))
  if (!Number.isFinite(delta) || delta === 0) {
    throw Object.assign(new Error('Stok değişim miktarı sıfırdan farklı bir tam sayı olmalıdır.'), { isValidation: true })
  }
  if (!params.reason?.trim()) {
    throw Object.assign(new Error('Stok değişikliği için bir açıklama girilmelidir.'), { isValidation: true })
  }

  const result = await db.transaction(async (tx) => {
    const [row] = await tx.query(
      db.raw.sql`SELECT id, name, sku, stock FROM products WHERE id = ${params.productId} FOR UPDATE`
        .returnsRow({ id: 'pg/text@1', name: 'pg/text@1', sku: 'pg/text@1', stock: 'pg/int4@1' } as never)
        .build()
    ) as unknown as Array<{ id: string; name: string; sku: string; stock: number }>
    if (!row) return null

    const previousStock = Number(row.stock)
    const newStock = Math.max(0, previousStock + delta)
    await tx.execute(
      db.raw.sql`UPDATE products SET stock = ${newStock}, updated_at = now() WHERE id = ${params.productId}`.affectedCount().build()
    )

    const ledger = await tx.orm.public.InventoryTransaction.create({
      productId: row.id,
      sku: row.sku,
      changeQuantity: newStock - previousStock,
      previousStock,
      newStock,
      previousReserved: 0,
      newReserved: 0,
      type: TRANSACTION_TYPE[params.movementType] ?? 'MANUAL_ADJUSTMENT',
      reason: `${params.movementType}: ${params.reason.trim()}`,
      idempotencyKey: `MANUAL_ADJ:${row.id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      metadata: { changedBy: params.changedBy, movementType: params.movementType } as never,
    })

    return { row, previousStock, newStock, ledgerId: ledger.id, createdAt: dbTimestampToIso(ledger.createdAt) }
  })

  if (!result) throw new Error('Stok ayarlanacak ürün bulunamadı.')

  invalidateCatalog()

  const movement: InventoryMovement = {
    id: result.ledgerId,
    productId: result.row.id,
    productName: result.row.name,
    previousStock: result.previousStock,
    newStock: result.newStock,
    quantityChange: result.newStock - result.previousStock,
    movementType: params.movementType,
    reason: params.reason.trim(),
    changedBy: params.changedBy,
    createdAt: result.createdAt ?? new Date().toISOString(),
  }

  await logAuditEvent({
    action: 'INVENTORY_ADJUSTED',
    entity: 'Inventory',
    entityId: params.productId,
    metadata: {
      productName: result.row.name,
      previousStock: result.previousStock,
      newStock: result.newStock,
      change: movement.quantityChange,
      reason: params.reason,
      changedBy: params.changedBy,
    },
  })

  enqueueStockSyncForProducts([params.productId]).catch(() => {})

  return { success: true, movement, newStock: result.newStock }
}

export interface StockLevelResult {
  productId: string
  name: string
  status: 'UPDATED' | 'UNCHANGED' | 'CONFLICT' | 'NOT_FOUND' | 'HAS_VARIANTS' | 'INVALID'
  previousStock: number | null
  newStock: number | null
  message?: string
}

const MAX_STOCK = 1_000_000

/**
 * Sets products to a counted stock level ("make it N"), one or many at once.
 *
 * Each product is locked, compared and written in its own transaction with a
 * ledger entry. With `expectedStock` (the number the admin was looking at) a
 * product whose stock changed meanwhile — e.g. an order arrived — is reported as a
 * CONFLICT and left untouched, so a count never silently undoes a sale.
 * Products with variants keep their stock on the variants and are skipped.
 */
export async function adminSetStockLevels(params: {
  items: Array<{ productId: string; stock: number; expectedStock?: number | null }>
  reason: string
  changedBy: string
}): Promise<StockLevelResult[]> {
  const reason = params.reason?.trim() || 'Stok sayımı'
  const results: StockLevelResult[] = []
  const variantOwners = new Set(
    (
      await db.orm.public.ProductVariant.select('productId')
        .where((v) => v.productId.in(params.items.map((i) => i.productId)))
        .all()
    ).map((v) => v.productId)
  )

  for (const item of params.items) {
    const target = Number(item.stock)
    if (!Number.isInteger(target) || target < 0 || target > MAX_STOCK) {
      results.push({ productId: item.productId, name: '', status: 'INVALID', previousStock: null, newStock: null, message: 'Stok 0 veya pozitif bir tam sayı olmalıdır.' })
      continue
    }
    if (variantOwners.has(item.productId)) {
      results.push({ productId: item.productId, name: '', status: 'HAS_VARIANTS', previousStock: null, newStock: null, message: 'Varyantlı ürün: stok varyantlar üzerinden girilir.' })
      continue
    }

    const outcome = await db.transaction(async (tx) => {
      const [row] = (await tx.query(
        db.raw.sql`SELECT id, name, sku, stock FROM products WHERE id = ${item.productId} FOR UPDATE`
          .returnsRow({ id: 'pg/text@1', name: 'pg/text@1', sku: 'pg/text@1', stock: 'pg/int4@1' } as never)
          .build()
      )) as unknown as Array<{ id: string; name: string; sku: string; stock: number }>
      if (!row) return { status: 'NOT_FOUND' as const, name: '', previous: null, next: null }

      const previous = Number(row.stock)
      if (item.expectedStock !== undefined && item.expectedStock !== null && Number(item.expectedStock) !== previous) {
        return { status: 'CONFLICT' as const, name: row.name, previous, next: null }
      }
      if (previous === target) return { status: 'UNCHANGED' as const, name: row.name, previous, next: target }

      await tx.execute(
        db.raw.sql`UPDATE products SET stock = ${target}, updated_at = now() WHERE id = ${row.id}`.affectedCount().build()
      )
      await tx.orm.public.InventoryTransaction.create({
        productId: row.id,
        sku: row.sku,
        changeQuantity: target - previous,
        previousStock: previous,
        newStock: target,
        previousReserved: 0,
        newReserved: 0,
        type: 'CYCLE_COUNT_ADJUSTMENT',
        reason: `COUNT: ${reason}`,
        idempotencyKey: `STOCK_COUNT:${row.id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        metadata: { changedBy: params.changedBy, movementType: 'CORRECTION' } as never,
      })
      return { status: 'UPDATED' as const, name: row.name, previous, next: target }
    })

    results.push({
      productId: item.productId,
      name: outcome.name,
      status: outcome.status,
      previousStock: outcome.previous,
      newStock: outcome.next,
      message:
        outcome.status === 'CONFLICT'
          ? `Siz düzenlerken stok değişti (şu an ${outcome.previous}). Güncel değere bakıp tekrar kaydedin.`
          : outcome.status === 'NOT_FOUND'
            ? 'Ürün bulunamadı.'
            : undefined,
    })
  }

  const updated = results.filter((r) => r.status === 'UPDATED')
  if (updated.length > 0) {
    invalidateCatalog()
    await logAuditEvent({
      action: 'INVENTORY_COUNTED',
      entity: 'Inventory',
      metadata: {
        reason,
        changedBy: params.changedBy,
        products: updated.map((r) => ({ id: r.productId, from: r.previousStock, to: r.newStock })),
      },
    })
  }
  return results
}

/**
 * Stock movement history from the inventory ledger (manual and order-driven).
 */
export async function adminGetInventoryMovements(productId?: string): Promise<InventoryMovement[]> {
  let query = db.orm.public.InventoryTransaction.orderBy((t) => t.createdAt.desc()).limit(200)
  if (productId) query = query.where({ productId })
  const rows = await query.all()

  const names = new Map(
    (rows.length
      ? await db.orm.public.Product.select('id', 'name').where((p) => p.id.in([...new Set(rows.map((r) => r.productId))])).all()
      : []
    ).map((p) => [p.id, p.name])
  )

  return rows.map((r) => {
    const meta = (r.metadata ?? {}) as { changedBy?: string; movementType?: InventoryMovement['movementType'] }
    const [, ...reasonParts] = (r.reason ?? '').split(': ')
    return {
      id: r.id,
      productId: r.productId,
      productName: names.get(r.productId) ?? r.sku,
      previousStock: r.previousStock,
      newStock: r.newStock,
      quantityChange: r.changeQuantity,
      movementType: meta.movementType ?? (r.type === 'RETURN_RESTOCK' ? 'RETURN' : 'MANUAL_ADJUSTMENT'),
      reason: reasonParts.join(': ') || r.reason || '',
      changedBy: meta.changedBy ?? 'system',
      createdAt: dbTimestampToIso(r.createdAt) ?? '',
    }
  })
}
