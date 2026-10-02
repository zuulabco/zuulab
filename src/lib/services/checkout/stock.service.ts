import 'server-only'
import { db } from '@/prisma/db'
import { refreshCatalogStock } from '@/lib/cache/catalog-cache'

/**
 * Stock for direct (storefront) orders.
 *
 * Source of truth: `products.stock`, or `product_variants.stock` for a variant line;
 * these are the numbers the admin edits and the storefront shows.
 *
 * Checkout decrements stock with a conditional UPDATE (`stock >= qty`), so concurrent
 * buyers can never oversell, across any number of serverless instances. The order's
 * `stock_state` records what it holds; every transition is a compare-and-set on that
 * column, so a duplicated callback, cron run or admin click restores stock at most once.
 *
 *   NONE ──hold──▶ HELD ──payment──▶ COMMITTED
 *                   │                    │
 *                   └──fail/expire/cancel┴──cancel──▶ RELEASED
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export interface StockLine {
  productId: string
  variantId: string | null
  quantity: number
  name?: string
}

export class InsufficientStockError extends Error {
  constructor(public line: StockLine) {
    super(`${line.name || 'Ürün'} için yeterli stok kalmadı.`)
    this.name = 'InsufficientStockError'
  }
}

/** Fixed lock order so two carts with the same products cannot deadlock. */
function sorted(lines: StockLine[]): StockLine[] {
  return [...lines].sort((a, b) =>
    `${a.productId}:${a.variantId ?? ''}`.localeCompare(`${b.productId}:${b.variantId ?? ''}`)
  )
}

async function decrement(tx: Tx, line: StockLine, allowNegative: boolean): Promise<boolean> {
  const plan = line.variantId
    ? allowNegative
      ? db.raw.sql`UPDATE product_variants SET stock = stock - ${line.quantity} WHERE id = ${line.variantId}`.affectedCount().build()
      : db.raw.sql`UPDATE product_variants SET stock = stock - ${line.quantity} WHERE id = ${line.variantId} AND stock >= ${line.quantity}`.affectedCount().build()
    : allowNegative
      ? db.raw.sql`UPDATE products SET stock = stock - ${line.quantity} WHERE id = ${line.productId}`.affectedCount().build()
      : db.raw.sql`UPDATE products SET stock = stock - ${line.quantity} WHERE id = ${line.productId} AND stock >= ${line.quantity}`.affectedCount().build()
  const { affectedRows } = await tx.execute(plan)
  return affectedRows === 1
}

async function increment(tx: Tx, line: StockLine): Promise<void> {
  const plan = line.variantId
    ? db.raw.sql`UPDATE product_variants SET stock = stock + ${line.quantity} WHERE id = ${line.variantId}`.affectedCount().build()
    : db.raw.sql`UPDATE products SET stock = stock + ${line.quantity} WHERE id = ${line.productId}`.affectedCount().build()
  await tx.execute(plan)
}

/** Moves the order's stock_state from one of `from` to `to`; true only for the caller that won. */
async function transitionStockState(
  tx: Tx,
  orderId: string,
  from: Array<'NONE' | 'HELD' | 'COMMITTED' | 'RELEASED'>,
  to: 'HELD' | 'COMMITTED' | 'RELEASED'
): Promise<boolean> {
  for (const state of from) {
    const plan = db.raw.sql`UPDATE orders SET stock_state = ${to}::"StockHoldState", updated_at = now() WHERE id = ${orderId} AND stock_state = ${state}::"StockHoldState"`.affectedCount().build()
    const { affectedRows } = await tx.execute(plan)
    if (affectedRows === 1) return true
  }
  return false
}

type OrderMove = 'HOLD' | 'SALE' | 'RELEASE'

/**
 * Writes the inventory ledger row for one order line that just moved stock, in the
 * same transaction, so the movement history always matches the stock column.
 */
async function ledgerForOrderLine(tx: Tx, orderId: string, line: StockLine, change: number, move: OrderMove): Promise<void> {
  const [order] = (await tx.query(
    db.raw.sql`SELECT order_number, channel FROM orders WHERE id = ${orderId}`
      .returnsRow({ order_number: 'pg/text@1', channel: 'pg/text@1' } as never)
      .build()
  )) as unknown as Array<{ order_number: string; channel: string }>
  const [product] = (await tx.query(
    db.raw.sql`SELECT sku, stock FROM products WHERE id = ${line.productId}`
      .returnsRow({ sku: 'pg/text@1', stock: 'pg/int4@1' } as never)
      .build()
  )) as unknown as Array<{ sku: string; stock: number }>
  if (!order || !product) return
  let current = product.stock
  if (line.variantId) {
    const [variant] = (await tx.query(
      db.raw.sql`SELECT stock FROM product_variants WHERE id = ${line.variantId}`
        .returnsRow({ stock: 'pg/int4@1' } as never)
        .build()
    )) as unknown as Array<{ stock: number }>
    if (variant) current = variant.stock
  }
  const marketplace = order.channel !== 'DIRECT'
  const type =
    move === 'RELEASE'
      ? marketplace ? 'MARKETPLACE_ORDER_RELEASE' : 'DIRECT_ORDER_RELEASE'
      : marketplace ? 'MARKETPLACE_ORDER_COMMIT' : move === 'HOLD' ? 'DIRECT_ORDER_RESERVATION' : 'DIRECT_ORDER_COMMIT'
  const reason =
    move === 'RELEASE'
      ? `Stok geri alındı: ${order.order_number} (iptal / ödenmedi)`
      : move === 'HOLD'
        ? `Sipariş için ayrıldı: ${order.order_number}`
        : `Satış: ${order.order_number}`
  await tx.orm.public.InventoryTransaction.create({
    productId: line.productId,
    sku: product.sku,
    changeQuantity: change,
    previousStock: current - change,
    newStock: current,
    previousReserved: 0,
    newReserved: 0,
    type,
    reason,
    orderNumber: order.order_number,
    idempotencyKey: `ORDER_STOCK:${orderId}:${move}:${line.productId}:${line.variantId ?? ''}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    metadata: (line.variantId ? { variantId: line.variantId, channel: order.channel } : { channel: order.channel }) as never,
  } as never)
}

/**
 * Takes stock for a new order inside its creation transaction. Throws
 * InsufficientStockError (rolling the whole order back) if any line cannot be met.
 */
export async function holdStockForNewOrder(tx: Tx, orderId: string, lines: StockLine[]): Promise<void> {
  for (const line of sorted(lines)) {
    if (!(await decrement(tx, line, false))) throw new InsufficientStockError(line)
    await ledgerForOrderLine(tx, orderId, line, -line.quantity, 'HOLD')
  }
  await transitionStockState(tx, orderId, ['NONE'], 'HELD')
}

async function orderLines(tx: Tx, orderId: string): Promise<StockLine[]> {
  const items = await tx.orm.public.OrderItem.where({ orderId }).all()
  return items.map((i) => ({
    productId: i.productId,
    variantId: i.variantId ?? null,
    quantity: i.quantity,
    name: i.productName,
  }))
}

/**
 * Payment succeeded. A HELD order simply becomes COMMITTED (stock was already taken).
 * If the hold had expired and been released before PayTR confirmed, the money is
 * captured regardless, so stock is taken again even if that drives it negative —
 * a negative number is an honest, visible oversell for the admin to resolve.
 */
export async function commitOrderStock(orderId: string): Promise<{ reacquired: boolean; oversold: boolean }> {
  const result = await db.transaction(async (tx) => {
    if (await transitionStockState(tx, orderId, ['HELD'], 'COMMITTED')) {
      return { reacquired: false, oversold: false }
    }
    if (await transitionStockState(tx, orderId, ['RELEASED', 'NONE'], 'COMMITTED')) {
      let oversold = false
      for (const line of sorted(await orderLines(tx, orderId))) {
        if (!(await decrement(tx, line, false))) {
          oversold = true
          await decrement(tx, line, true)
        }
        await ledgerForOrderLine(tx, orderId, line, -line.quantity, 'SALE')
      }
      return { reacquired: true, oversold }
    }
    return { reacquired: false, oversold: false }
  })
  if (result.reacquired) refreshCatalogStock()
  return result
}

/**
 * Returns the order's stock to the shelf (payment failed, session expired, or the
 * order was cancelled before shipping). Safe to call any number of times.
 */
export async function releaseOrderStock(
  orderId: string,
  options: { includeCommitted?: boolean } = {}
): Promise<boolean> {
  const released = await db.transaction(async (tx) => {
    const from: Array<'HELD' | 'COMMITTED'> = options.includeCommitted ? ['HELD', 'COMMITTED'] : ['HELD']
    if (!(await transitionStockState(tx, orderId, from, 'RELEASED'))) return false
    for (const line of sorted(await orderLines(tx, orderId))) {
      await increment(tx, line)
      await ledgerForOrderLine(tx, orderId, line, line.quantity, 'RELEASE')
    }
    return true
  })
  if (released) refreshCatalogStock()
  return released
}

/**
 * A failed order the customer retries must take its stock again before a new
 * payment session is opened.
 */
export async function reacquireOrderStock(orderId: string): Promise<void> {
  await db.transaction(async (tx) => {
    if (!(await transitionStockState(tx, orderId, ['RELEASED', 'NONE'], 'HELD'))) return
    for (const line of sorted(await orderLines(tx, orderId))) {
      if (!(await decrement(tx, line, false))) throw new InsufficientStockError(line)
      await ledgerForOrderLine(tx, orderId, line, -line.quantity, 'HOLD')
    }
  })
  refreshCatalogStock()
}

/** Current sellable stock for each line (admin order view). */
export async function currentStockFor(lines: Array<{ productId: string; variantId?: string | null }>) {
  const productIds = [...new Set(lines.map((l) => l.productId))]
  const variantIds = [...new Set(lines.map((l) => l.variantId).filter((v): v is string => Boolean(v)))]
  const [products, variants] = await Promise.all([
    productIds.length ? db.orm.public.Product.select('id', 'stock').where((p) => p.id.in(productIds)).all() : [],
    variantIds.length ? db.orm.public.ProductVariant.select('id', 'stock').where((v) => v.id.in(variantIds)).all() : [],
  ])
  const productStock = new Map(products.map((p) => [p.id, p.stock]))
  const variantStock = new Map(variants.map((v) => [v.id, v.stock]))
  return (line: { productId: string; variantId?: string | null }) =>
    line.variantId ? variantStock.get(line.variantId) ?? 0 : productStock.get(line.productId) ?? 0
}

// ─────────────────────────────────────────────────────────────
// Returns & exchanges
// ─────────────────────────────────────────────────────────────

async function writeLedger(
  tx: Tx,
  params: { productId: string; changeQuantity: number; type: 'RETURN_RESTOCK' | 'MANUAL_ADJUSTMENT'; reason: string; idempotencyKey: string }
) {
  const [row] = (await tx.query(
    db.raw.sql`SELECT sku, stock FROM products WHERE id = ${params.productId}`
      .returnsRow({ sku: 'pg/text@1', stock: 'pg/int4@1' } as never)
      .build()
  )) as unknown as Array<{ sku: string; stock: number }>
  if (!row) return
  await tx.orm.public.InventoryTransaction.create({
    productId: params.productId,
    sku: row.sku,
    changeQuantity: params.changeQuantity,
    previousStock: row.stock - params.changeQuantity,
    newStock: row.stock,
    previousReserved: 0,
    newReserved: 0,
    type: params.type,
    reason: params.reason,
    idempotencyKey: params.idempotencyKey,
  })
}

/**
 * Puts inspected, sellable returned units back on the shelf. The ledger's unique
 * idempotency key makes a repeated call for the same return item a no-op.
 */
export async function restockReturnedUnits(params: {
  productId: string
  quantity: number
  returnNumber: string
  returnItemId: string
}): Promise<boolean> {
  const key = `RETURN_RESTOCK:${params.returnItemId}`
  if (await db.orm.public.InventoryTransaction.where({ idempotencyKey: key }).first()) return false
  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        db.raw.sql`UPDATE products SET stock = stock + ${params.quantity}, updated_at = now() WHERE id = ${params.productId}`.affectedCount().build()
      )
      await writeLedger(tx, {
        productId: params.productId,
        changeQuantity: params.quantity,
        type: 'RETURN_RESTOCK',
        reason: `İade stoğa alındı (${params.returnNumber})`,
        idempotencyKey: key,
      })
    })
  } catch (err) {
    if (/unique|duplicate key|23505/i.test(String((err as Error)?.message ?? err) + JSON.stringify(err ?? {}))) return false
    throw err
  }
  refreshCatalogStock()
  return true
}

/** Takes stock for an exchange replacement; throws InsufficientStockError if not available. */
export async function takeExchangeUnits(params: {
  productId: string
  quantity: number
  returnNumber: string
}): Promise<void> {
  await db.transaction(async (tx) => {
    const line = { productId: params.productId, variantId: null, quantity: params.quantity }
    if (!(await decrement(tx, line, false))) throw new InsufficientStockError(line)
    await writeLedger(tx, {
      productId: params.productId,
      changeQuantity: -params.quantity,
      type: 'MANUAL_ADJUSTMENT',
      reason: `Değişim ürünü ayrıldı (${params.returnNumber})`,
      idempotencyKey: `EXCHANGE:${params.returnNumber}:${params.productId}`,
    })
  })
  refreshCatalogStock()
}
