import 'server-only'
import { db } from '@/prisma/db'
import { logAuditEvent } from './admin.service'
import { releaseOrderStock } from './checkout/stock.service'

/**
 * Permanently deletes a storefront order (test orders, cancelled ones). Super Admin only (route).
 *
 * What is refused, and why:
 * - Marketplace orders: the marketplace sends them again on the next sync, so deleting would only make them reappear.
 * - Orders with an invoice: e-invoices are legal records that must be kept.
 * - Orders with a return request: part of an open or closed return case.
 * - Anything without the order number typed back as confirmation (checked by the caller too).
 *
 * What it does: puts held or committed stock back on the shelf (idempotent: nothing happens if it was already
 * released), removes the order with its payments, shipments, e-mails sent for it and its tracking events, and
 * writes an audit entry that keeps the order number, amount and customer. The stock ledger rows for the order
 * stay (they are history and carry no foreign key).
 */

export class OrderDeleteError extends Error {}

type Rec = Record<string, unknown>
const run = <T = Rec>(query: unknown) => db.runtime().query(query as never) as unknown as Promise<T[]>

export interface DeletedOrder {
  orderNumber: string
  status: string
  total: number
  customerEmail: string | null
}

/** Why an order cannot be deleted, or null when it can */
export function deleteBlocker(order: { channel: string; invoices: number; returns: number }): string | null {
  if (order.channel !== 'DIRECT') return 'Pazaryeri siparişleri silinemez: bir sonraki senkronizasyonda pazaryerinden yeniden gelir.'
  if (order.invoices > 0) return 'Bu sipariş için fatura kesilmiş. Fatura kayıtları yasal olarak saklanmalı, sipariş silinemez.'
  if (order.returns > 0) return 'Bu siparişin iade kaydı var, silinemez.'
  return null
}

export async function deleteOrder(orderNumber: string, confirm: string, actor: { id?: string; email: string }): Promise<DeletedOrder> {
  if (confirm.trim() !== orderNumber) throw new OrderDeleteError('Silmeyi onaylamak için sipariş numarasını aynen yazın.')

  const [order] = await run<{ id: string; status: string; channel: string; total: string; email: string | null; invoices: number; returns: number }>(
    db.raw.sql`SELECT o.id, o.status::text AS status, o.channel, o.total::text AS total, u.email,
        (SELECT COUNT(*)::int FROM invoices v WHERE v.order_id = o.id) AS invoices,
        (SELECT COUNT(*)::int FROM return_requests r WHERE r.order_id = o.id) AS returns
      FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.order_number = ${orderNumber}`
      .returnsRow({ id: 'pg/text@1', status: 'pg/text@1', channel: 'pg/text@1', total: 'pg/text@1', email: 'pg/text@1', invoices: 'pg/int4@1', returns: 'pg/int4@1' } as never)
      .build()
  )
  if (!order) throw new OrderDeleteError('Sipariş bulunamadı.')
  const blocker = deleteBlocker({ channel: order.channel, invoices: Number(order.invoices), returns: Number(order.returns) })
  if (blocker) throw new OrderDeleteError(blocker)

  // Stock first: if this fails nothing has been deleted. Safe to repeat.
  await releaseOrderStock(order.id, { includeCommitted: true })

  await db.transaction(async (tx) => {
    const exec = (plan: unknown) => tx.execute(plan as never)
    const id = order.id
    await exec(
      db.raw.sql`UPDATE coupons c SET current_uses = GREATEST(0, c.current_uses - u.n)
        FROM (SELECT coupon_id, COUNT(*)::int AS n FROM coupon_usages WHERE order_id = ${id} GROUP BY coupon_id) u
        WHERE c.id = u.coupon_id`.affectedCount().build()
    )
    await exec(db.raw.sql`DELETE FROM coupon_usages WHERE order_id = ${id}`.affectedCount().build())
    await exec(db.raw.sql`DELETE FROM email_messages WHERE order_id = ${id}`.affectedCount().build())
    await exec(db.raw.sql`DELETE FROM marketing_events WHERE order_number = ${orderNumber}`.affectedCount().build())
    await exec(db.raw.sql`DELETE FROM warehouse_fulfillments WHERE order_id = ${id}`.affectedCount().build())
    await exec(db.raw.sql`DELETE FROM shipping_shipments WHERE order_id = ${id}`.affectedCount().build())
    await exec(db.raw.sql`UPDATE reviews SET order_id = NULL WHERE order_id = ${id}`.affectedCount().build())
    await exec(db.raw.sql`UPDATE support_tickets SET order_id = NULL WHERE order_id = ${id}`.affectedCount().build())
    await exec(db.raw.sql`DELETE FROM shipments WHERE order_id = ${id}`.affectedCount().build())
    await exec(db.raw.sql`DELETE FROM payments WHERE order_id = ${id}`.affectedCount().build())
    // order_items, order_notes and order_status_history go with the order (cascade)
    const { affectedRows } = await exec(db.raw.sql`DELETE FROM orders WHERE id = ${id}`.affectedCount().build())
    if (affectedRows !== 1) throw new OrderDeleteError('Sipariş silinemedi.')
  })

  const deleted: DeletedOrder = { orderNumber, status: order.status, total: Number(order.total), customerEmail: order.email }
  await logAuditEvent({
    userId: actor.id,
    action: 'ORDER_DELETED',
    entity: 'Order',
    entityId: orderNumber,
    metadata: { orderNumber, status: order.status, total: deleted.total, customerEmail: order.email, by: actor.email },
  })
  return deleted
}
