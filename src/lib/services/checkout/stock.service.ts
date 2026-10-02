import 'server-only'
import { db } from '@/prisma/db'

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

/**
 * Takes stock for a new order inside its creation transaction. Throws
 * InsufficientStockError (rolling the whole order back) if any line cannot be met.
 */
export async function holdStockForNewOrder(tx: Tx, orderId: string, lines: StockLine[]): Promise<void> {
  for (const line of sorted(lines)) {
    if (!(await decrement(tx, line, false))) throw new InsufficientStockError(line)
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
  return db.transaction(async (tx) => {
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
      }
      return { reacquired: true, oversold }
    }
    return { reacquired: false, oversold: false }
  })
}

/**
 * Returns the order's stock to the shelf (payment failed, session expired, or the
 * order was cancelled before shipping). Safe to call any number of times.
 */
export async function releaseOrderStock(
  orderId: string,
  options: { includeCommitted?: boolean } = {}
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const from: Array<'HELD' | 'COMMITTED'> = options.includeCommitted ? ['HELD', 'COMMITTED'] : ['HELD']
    if (!(await transitionStockState(tx, orderId, from, 'RELEASED'))) return false
    for (const line of sorted(await orderLines(tx, orderId))) {
      await increment(tx, line)
    }
    return true
  })
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
    }
  })
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
