import 'server-only'
import { db } from '@/prisma/db'

/**
 * Dots on the customer's account tabs.
 *
 * "orders"  — an order of theirs was paid or changed status (confirmed, shipped,
 *             delivered…) since they last opened their orders.
 * "support" — the support team replied, or a ticket was resolved or closed, since they
 *             last opened their support tickets.
 *
 * Everything is compared in SQL against users.orders_seen_at / support_seen_at. All the
 * timestamps involved come from the database clock (column defaults and now()), so app
 * and database clock drift cannot hide or invent a dot. A customer who has never been
 * marked starts from "now": events before this feature existed do not light up.
 */
export type BadgeSection = 'orders' | 'support'

export interface AccountBadges {
  orders: boolean
  support: boolean
}

export async function getAccountBadges(userId: string): Promise<AccountBadges> {
  await db.runtime().execute(
    db.raw.sql`
      UPDATE users SET
        orders_seen_at = COALESCE(orders_seen_at, (now() AT TIME ZONE 'UTC')),
        support_seen_at = COALESCE(support_seen_at, (now() AT TIME ZONE 'UTC'))
      WHERE id = ${userId} AND (orders_seen_at IS NULL OR support_seen_at IS NULL)
    `.affectedCount().build()
  )

  const [row] = (await db.runtime().query(
    db.raw.sql`
      SELECT
        EXISTS (
          SELECT 1 FROM order_status_history h
          JOIN orders o ON o.id = h.order_id
          WHERE o.user_id = u.id
            AND h.status NOT IN ('PAYMENT_PENDING', 'PAYMENT_FAILED')
            AND (h.created_by IS NULL OR h.created_by NOT LIKE 'internal-note:%')
            AND h.created_at > u.orders_seen_at
        )::int AS orders,
        (
          EXISTS (
            SELECT 1 FROM support_messages m
            JOIN support_tickets t ON t.id = m.ticket_id
            WHERE t.user_id = u.id
              AND m.author_type = 'STAFF'
              AND m.is_internal = false
              AND m.created_at > u.support_seen_at
          )
          OR EXISTS (
            SELECT 1 FROM support_tickets t
            WHERE t.user_id = u.id AND t.resolved_at > u.support_seen_at
          )
        )::int AS support
      FROM users u
      WHERE u.id = ${userId}
    `
      .returnsRow({ orders: 'pg/int4@1', support: 'pg/int4@1' } as never)
      .build()
  )) as unknown as Array<{ orders: number; support: number }>

  return { orders: Number(row?.orders) === 1, support: Number(row?.support) === 1 }
}

export async function markSectionSeen(userId: string, section: BadgeSection): Promise<void> {
  const statement =
    section === 'orders'
      ? db.raw.sql`UPDATE users SET orders_seen_at = (now() AT TIME ZONE 'UTC') WHERE id = ${userId}`
      : db.raw.sql`UPDATE users SET support_seen_at = (now() AT TIME ZONE 'UTC') WHERE id = ${userId}`
  await db.runtime().execute(statement.affectedCount().build())
}
