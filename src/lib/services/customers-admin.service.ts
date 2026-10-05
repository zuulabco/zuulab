import 'server-only'
import { db } from '@/prisma/db'
import { adminAuth } from '@/lib/firebase-admin'
import { logAuditEvent } from './admin.service'
import { getUserOrders } from './orders.service'

/**
 * The admin's Müşteriler page, on the real database: accounts with the CUSTOMER role (the placeholder
 * accounts made for marketplace buyers are not members and are left out), with their orders counted from
 * the orders table. A sale counts when the order is in a sold status (paid or on its way), like everywhere else.
 *
 * Deleting a member:
 * - "delete": removes the account. Refused while the member has orders, returns, reviews, support tickets or
 *   coupon uses, because those are the shop's records (orders and invoices must be kept by law).
 * - "anonymize": for members with such records. The account stays as an empty shell (name, e-mail, phone,
 *   addresses, carts, favourites and notifications are removed) so the records keep making sense, and the
 *   person can no longer sign in. This is the KVKK-style erasure.
 * Both take the e-mail permission back, remove the Firebase sign-in and leave an audit entry.
 */

type Rec = Record<string, unknown>
const run = <T = Rec>(query: unknown) => db.runtime().query(query as never) as unknown as Promise<T[]>
const int = (v: unknown) => Number(v ?? 0)

export class CustomerError extends Error {}

export interface AdminCustomerSummary {
  id: string
  name: string
  email: string
  phone: string | null
  orderCount: number
  totalSpend: number
  lastOrderDate: string | null
  status: 'ACTIVE' | 'SUSPENDED'
  createdAt: string
}

const SOLD = `('PAYMENT_RECEIVED', 'CONFIRMED', 'PREPARING', 'IN_PRODUCTION', 'PACKING', 'SHIPPED', 'DELIVERED')`

function displayName(r: { name: string | null; first_name: string | null; last_name: string | null }): string {
  return (r.name || `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim()).trim()
}

/** Accounts of members, newest first, with their order totals */
export async function adminGetCustomers(filters?: { search?: string; status?: string }): Promise<AdminCustomerSummary[]> {
  const rows = await run<{
    id: string; email: string; name: string | null; first_name: string | null; last_name: string | null; phone: string | null
    status: string; created_at: string; order_count: number; total_spend: string; last_order: string | null
  }>(
    db.raw.sql`
      SELECT u.id, u.email, u.name, u.first_name, u.last_name, u.phone, u.status, u.created_at::text AS created_at,
        COUNT(o.id) FILTER (WHERE o.status::text IN ('PAYMENT_RECEIVED', 'CONFIRMED', 'PREPARING', 'IN_PRODUCTION', 'PACKING', 'SHIPPED', 'DELIVERED'))::int AS order_count,
        COALESCE(SUM(o.total) FILTER (WHERE o.status::text IN ('PAYMENT_RECEIVED', 'CONFIRMED', 'PREPARING', 'IN_PRODUCTION', 'PACKING', 'SHIPPED', 'DELIVERED')), 0)::text AS total_spend,
        MAX(o.created_at)::text AS last_order
      FROM users u LEFT JOIN orders o ON o.user_id = u.id
      WHERE u.role = 'CUSTOMER' AND u.status <> 'MARKETPLACE'
      GROUP BY u.id ORDER BY u.created_at DESC`
      .returnsRow({
        id: 'pg/text@1', email: 'pg/text@1', name: 'pg/text@1', first_name: 'pg/text@1', last_name: 'pg/text@1', phone: 'pg/text@1',
        status: 'pg/text@1', created_at: 'pg/text@1', order_count: 'pg/int4@1', total_spend: 'pg/text@1', last_order: 'pg/text@1',
      } as never)
      .build()
  )
  let list: AdminCustomerSummary[] = rows.map((r) => ({
    id: r.id,
    name: displayName(r) || r.email.split('@')[0],
    email: r.email,
    phone: r.phone,
    orderCount: int(r.order_count),
    totalSpend: Number(r.total_spend),
    lastOrderDate: r.last_order ? new Date(`${r.last_order.replace(' ', 'T')}Z`).toISOString() : null,
    status: r.status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED',
    createdAt: new Date(`${r.created_at.replace(' ', 'T')}Z`).toISOString(),
  }))
  if (filters?.search) {
    const q = filters.search.toLocaleLowerCase('tr-TR')
    list = list.filter((c) => c.name.toLocaleLowerCase('tr-TR').includes(q) || c.email.toLowerCase().includes(q) || (c.phone ?? '').includes(q))
  }
  if (filters?.status && filters.status !== 'ALL') list = list.filter((c) => c.status === filters.status)
  return list
}

export interface CustomerRecords {
  orders: number
  returns: number
  reviews: number
  tickets: number
  couponUses: number
}

async function recordsOf(userId: string): Promise<CustomerRecords> {
  const [row] = await run<{ orders: number; returns: number; reviews: number; tickets: number; coupons: number }>(
    db.raw.sql`SELECT
        (SELECT COUNT(*)::int FROM orders WHERE user_id = ${userId}) AS orders,
        (SELECT COUNT(*)::int FROM return_requests WHERE user_id = ${userId}) AS returns,
        (SELECT COUNT(*)::int FROM reviews WHERE user_id = ${userId}) AS reviews,
        (SELECT COUNT(*)::int FROM support_tickets WHERE user_id = ${userId}) AS tickets,
        (SELECT COUNT(*)::int FROM coupon_usages WHERE user_id = ${userId}) AS coupons`
      .returnsRow({ orders: 'pg/int4@1', returns: 'pg/int4@1', reviews: 'pg/int4@1', tickets: 'pg/int4@1', coupons: 'pg/int4@1' } as never)
      .build()
  )
  return { orders: int(row?.orders), returns: int(row?.returns), reviews: int(row?.reviews), tickets: int(row?.tickets), couponUses: int(row?.coupons) }
}

/** Why a member cannot simply be deleted, in words; empty when nothing blocks it */
export function deletionBlockers(r: CustomerRecords): string[] {
  const out: string[] = []
  if (r.orders) out.push(`${r.orders} sipariş`)
  if (r.returns) out.push(`${r.returns} iade kaydı`)
  if (r.reviews) out.push(`${r.reviews} yorum`)
  if (r.tickets) out.push(`${r.tickets} destek talebi`)
  if (r.couponUses) out.push(`${r.couponUses} kupon kullanımı`)
  return out
}

export async function adminGetCustomerDetail(id: string) {
  const [u] = await run<{
    id: string; email: string; name: string | null; first_name: string | null; last_name: string | null; phone: string | null
    status: string; created_at: string; last_login: string | null; favorites: number
  }>(
    db.raw.sql`SELECT u.id, u.email, u.name, u.first_name, u.last_name, u.phone, u.status, u.created_at::text AS created_at,
        u.last_login_at::text AS last_login, (SELECT COUNT(*)::int FROM favorites f WHERE f.user_id = u.id) AS favorites
      FROM users u WHERE u.id = ${id} AND u.role = 'CUSTOMER' AND u.status <> 'MARKETPLACE'`
      .returnsRow({
        id: 'pg/text@1', email: 'pg/text@1', name: 'pg/text@1', first_name: 'pg/text@1', last_name: 'pg/text@1', phone: 'pg/text@1',
        status: 'pg/text@1', created_at: 'pg/text@1', last_login: 'pg/text@1', favorites: 'pg/int4@1',
      } as never)
      .build()
  )
  if (!u) return null
  const [orders, addresses, records] = await Promise.all([
    getUserOrders(id),
    run<{ title: string; phone: string; line1: string; line2: string | null; city: string; district: string; postal: string }>(
      db.raw.sql`SELECT title, phone, address_line_1 AS line1, address_line_2 AS line2, city, district, postal_code AS postal
        FROM addresses WHERE user_id = ${id} ORDER BY is_default DESC, created_at`
        .returnsRow({ title: 'pg/text@1', phone: 'pg/text@1', line1: 'pg/text@1', line2: 'pg/text@1', city: 'pg/text@1', district: 'pg/text@1', postal: 'pg/text@1' } as never)
        .build()
    ),
    recordsOf(id),
  ])
  const sold = orders.filter((o) => ['PAYMENT_RECEIVED', 'CONFIRMED', 'PREPARING', 'IN_PRODUCTION', 'PACKING', 'SHIPPED', 'DELIVERED'].includes(String(o.status)))
  return {
    id: u.id,
    name: displayName(u) || u.email.split('@')[0],
    email: u.email,
    phone: u.phone,
    status: u.status === 'ACTIVE' ? 'ACTIVE' : 'SUSPENDED',
    createdAt: new Date(`${u.created_at.replace(' ', 'T')}Z`).toISOString(),
    lastLoginAt: u.last_login ? new Date(`${u.last_login.replace(' ', 'T')}Z`).toISOString() : null,
    totalSpend: sold.reduce((a, o) => a + Number((o as { totalAmount?: number }).totalAmount ?? 0), 0),
    lastOrderDate: orders.length ? orders.map((o) => String(o.createdAt)).sort().at(-1)! : null,
    orders,
    addresses: addresses.map((a) => ({
      title: a.title,
      city: a.city,
      district: a.district,
      addressLine: [a.line1, a.line2].filter(Boolean).join(' '),
      postalCode: a.postal,
      phone: a.phone,
    })),
    favoritesCount: int(u.favorites),
    records,
    deletionBlockers: deletionBlockers(records),
  }
}

export async function adminUpdateCustomerStatus(params: {
  customerId: string
  status: 'ACTIVE' | 'SUSPENDED'
  reason?: string
  adminEmail: string
}) {
  const [target] = await run<{ id: string; email: string }>(
    db.raw.sql`SELECT id, email FROM users WHERE id = ${params.customerId} AND role = 'CUSTOMER' AND status <> 'MARKETPLACE'`
      .returnsRow({ id: 'pg/text@1', email: 'pg/text@1' } as never)
      .build()
  )
  if (!target) throw new CustomerError('Müşteri bulunamadı.')
  await db.runtime().execute(
    db.raw.sql`UPDATE users SET status = ${params.status}, is_active = ${params.status === 'ACTIVE'}, updated_at = now() WHERE id = ${params.customerId}`
      .affectedCount()
      .build() as never
  )
  await logAuditEvent({
    action: params.status === 'SUSPENDED' ? 'CUSTOMER_SUSPENDED' : 'CUSTOMER_ACTIVATED',
    entity: 'User',
    entityId: params.customerId,
    metadata: { customerEmail: target.email, reason: params.reason || null, adminEmail: params.adminEmail },
  })
  const detail = await adminGetCustomers()
  return detail.find((c) => c.id === params.customerId) ?? null
}

export type DeleteMode = 'delete' | 'anonymize'

/** Permanently removes a member (Super Admin only, see the route). `confirmEmail` must match the account's address. */
export async function adminDeleteCustomer(params: {
  customerId: string
  mode: DeleteMode
  confirmEmail: string
  actor: { id?: string; email: string }
}): Promise<{ mode: DeleteMode; email: string }> {
  const [u] = await run<{ id: string; email: string; role: string; firebase_uid: string | null; status: string }>(
    db.raw.sql`SELECT id, email, role::text AS role, firebase_uid, status FROM users WHERE id = ${params.customerId}`
      .returnsRow({ id: 'pg/text@1', email: 'pg/text@1', role: 'pg/text@1', firebase_uid: 'pg/text@1', status: 'pg/text@1' } as never)
      .build()
  )
  if (!u) throw new CustomerError('Müşteri bulunamadı.')
  if (u.role !== 'CUSTOMER') throw new CustomerError('Yalnızca müşteri hesapları silinebilir. Yönetici ve personel hesapları için önce rolü müşteriye çevirin.')
  if (u.status === 'MARKETPLACE') throw new CustomerError('Pazaryeri alıcısı kayıtları silinemez.')
  if (params.actor.id && params.actor.id === u.id) throw new CustomerError('Kendi hesabınızı silemezsiniz.')
  if (params.confirmEmail.trim().toLowerCase() !== u.email.toLowerCase()) throw new CustomerError('Silmeyi onaylamak için üyenin e-posta adresini aynen yazın.')

  const records = await recordsOf(u.id)
  const blockers = deletionBlockers(records)
  if (params.mode === 'delete' && blockers.length > 0) {
    throw new CustomerError(`Bu üyenin ${blockers.join(', ')} var; bu kayıtlar saklanmalı. “Kişisel verilerini sil (anonimleştir)” seçeneğini kullanın: hesap kapanır, kayıtlar isimsiz kalır.`)
  }

  const exec = (plan: unknown) => db.runtime().execute(plan as never)
  // Take the e-mail permission and the newsletter back first, for the address as it is now
  await exec(db.raw.sql`UPDATE email_consents SET status = 'WITHDRAWN', withdrawn_at = now(), updated_at = now() WHERE lower(email) = lower(${u.email}) AND status = 'ACTIVE'`.affectedCount().build())
  await exec(db.raw.sql`UPDATE newsletter_subscribers SET status = 'UNSUBSCRIBED', unsubscribed_at = now(), updated_at = now() WHERE lower(email) = lower(${u.email}) AND status <> 'UNSUBSCRIBED'`.affectedCount().build())

  // The sign-in itself: without this the person could still log in and the account would be recreated
  if (u.firebase_uid && adminAuth) {
    try {
      await adminAuth.deleteUser(u.firebase_uid)
    } catch (e) {
      const code = (e as { code?: string })?.code
      if (code !== 'auth/user-not-found') throw new CustomerError('Giriş hesabı silinemedi, işlem durduruldu. Biraz sonra tekrar deneyin.')
    }
  }

  if (params.mode === 'delete') {
    await exec(db.raw.sql`DELETE FROM users WHERE id = ${u.id}`.affectedCount().build())
  } else {
    const shell = `silinen-${u.id}@deleted.invalid`
    await db.transaction(async (tx) => {
      const x = (plan: unknown) => tx.execute(plan as never)
      await x(db.raw.sql`DELETE FROM addresses WHERE user_id = ${u.id}`.affectedCount().build())
      await x(db.raw.sql`DELETE FROM carts WHERE user_id = ${u.id}`.affectedCount().build())
      await x(db.raw.sql`DELETE FROM favorites WHERE user_id = ${u.id}`.affectedCount().build())
      await x(db.raw.sql`DELETE FROM notifications WHERE user_id = ${u.id}`.affectedCount().build())
      await x(
        db.raw.sql`UPDATE users SET email = ${shell}, name = NULL, first_name = NULL, last_name = NULL, phone = NULL, avatar = NULL,
          firebase_uid = NULL, status = 'INACTIVE', is_active = false, marketing_opt_in = false, email_verified = false, updated_at = now()
          WHERE id = ${u.id}`.affectedCount().build()
      )
    })
  }

  await logAuditEvent({
    userId: params.actor.id,
    action: params.mode === 'delete' ? 'CUSTOMER_DELETED' : 'CUSTOMER_ANONYMIZED',
    entity: 'User',
    entityId: u.id,
    metadata: { customerEmail: u.email, kept: blockers, by: params.actor.email },
  })
  return { mode: params.mode, email: u.email }
}
