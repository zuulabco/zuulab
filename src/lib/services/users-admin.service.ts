import 'server-only'
import { db } from '@/prisma/db'
import { type AuthUser } from './auth.service'
import { logAuditEvent } from './admin.service'

/**
 * The admin's "Kullanıcılar ve roller" page, on the real database: every account (members, staff and
 * administrators) with its role and status. The placeholder accounts made for marketplace buyers are not
 * people who sign in and are left out.
 *
 * Rules for changing a role or status: only a Super Admin can give or change the Super Admin role or
 * suspend a Super Admin, and the last Super Admin can never lose the role or be suspended.
 */

type Rec = Record<string, unknown>
const run = <T = Rec>(query: unknown) => db.runtime().query(query as never) as unknown as Promise<T[]>

export interface AdminUserListItem {
  id: string
  firebaseUid?: string | null
  email: string
  name: string | null
  role: AuthUser['role']
  status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE'
  orderCount: number
  lastLoginAt: string | null
  createdAt: string
}

const ROLES: AuthUser['role'][] = ['CUSTOMER', 'ADMIN', 'SUPER_ADMIN', 'STAFF', 'SUPPORT', 'CONTENT_MANAGER', 'ORDER_MANAGER']
const STATUSES = ['ACTIVE', 'SUSPENDED', 'INACTIVE'] as const

const iso = (v: string | null) => (v ? new Date(`${v.replace(' ', 'T')}${/[zZ]|[+-]\d\d(:?\d\d)?$/.test(v) ? '' : 'Z'}`).toISOString() : null)

async function rowsOf(where: 'all' | string): Promise<AdminUserListItem[]> {
  const rows = await run<{
    id: string; firebase_uid: string | null; email: string; name: string | null; first_name: string | null; last_name: string | null
    role: string; status: string; is_active: boolean; last_login: string | null; created_at: string; order_count: number
  }>(
    db.raw.sql`
      SELECT u.id, u.firebase_uid, u.email, u.name, u.first_name, u.last_name, u.role::text AS role, u.status, u.is_active,
        u.last_login_at::text AS last_login, u.created_at::text AS created_at,
        (SELECT COUNT(*)::int FROM orders o WHERE o.user_id = u.id) AS order_count
      FROM users u
      WHERE u.status <> 'MARKETPLACE' AND (${where} = 'all' OR u.id = ${where})
      ORDER BY (u.role = 'SUPER_ADMIN') DESC, u.created_at`
      .returnsRow({
        id: 'pg/text@1', firebase_uid: 'pg/text@1', email: 'pg/text@1', name: 'pg/text@1', first_name: 'pg/text@1', last_name: 'pg/text@1',
        role: 'pg/text@1', status: 'pg/text@1', is_active: 'pg/bool@1', last_login: 'pg/text@1', created_at: 'pg/text@1', order_count: 'pg/int4@1',
      } as never)
      .build()
  )
  return rows.map((r) => ({
    id: r.id,
    firebaseUid: r.firebase_uid,
    email: r.email,
    name: (r.name || `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim()) || null,
    role: (ROLES.includes(r.role as never) ? r.role : 'CUSTOMER') as AuthUser['role'],
    status: (r.status === 'ACTIVE' || r.status === 'SUSPENDED' || r.status === 'INACTIVE' ? r.status : r.is_active ? 'ACTIVE' : 'INACTIVE') as AdminUserListItem['status'],
    orderCount: Number(r.order_count ?? 0),
    lastLoginAt: iso(r.last_login),
    createdAt: iso(r.created_at) ?? new Date().toISOString(),
  }))
}

export async function adminGetUsers(filters?: { role?: string; status?: string; search?: string }): Promise<AdminUserListItem[]> {
  let list = await rowsOf('all')
  if (filters?.role && filters.role !== 'ALL') list = list.filter((u) => u.role === filters.role)
  if (filters?.status && filters.status !== 'ALL') list = list.filter((u) => u.status === filters.status)
  if (filters?.search) {
    const q = filters.search.toLocaleLowerCase('tr-TR')
    list = list.filter((u) => u.email.toLowerCase().includes(q) || (u.name ?? '').toLocaleLowerCase('tr-TR').includes(q))
  }
  return list
}

export async function adminGetUserById(id: string): Promise<AdminUserListItem | null> {
  return (await rowsOf(id))[0] ?? null
}

async function superAdminCount(): Promise<number> {
  const [row] = await run<{ n: number }>(
    db.raw.sql`SELECT COUNT(*)::int AS n FROM users WHERE role = 'SUPER_ADMIN' AND status = 'ACTIVE'`.returnsRow({ n: 'pg/int4@1' } as never).build()
  )
  return Number(row?.n ?? 0)
}

export async function adminUpdateUserRole(params: {
  targetUserId: string
  newRole: AuthUser['role']
  actorUser: AuthUser
}): Promise<AdminUserListItem> {
  const { targetUserId, newRole, actorUser } = params
  if (!ROLES.includes(newRole)) throw new Error('Geçersiz rol.')

  const target = await adminGetUserById(targetUserId)
  if (!target) throw new Error('Kullanıcı bulunamadı.')

  // Guard: only a Super Admin can assign or modify the Super Admin role
  if (newRole === 'SUPER_ADMIN' && actorUser.role !== 'SUPER_ADMIN') {
    throw new Error('FORBIDDEN: Süper Admin rolünü yalnızca mevcut bir Süper Admin atayabilir.')
  }
  if (target.role === 'SUPER_ADMIN' && actorUser.role !== 'SUPER_ADMIN') {
    throw new Error('FORBIDDEN: Süper Admin kullanıcısının rolü yalnızca başka bir Süper Admin tarafından değiştirilebilir.')
  }
  // The shop must never be left without a Super Admin
  if (target.role === 'SUPER_ADMIN' && newRole !== 'SUPER_ADMIN' && (await superAdminCount()) <= 1) {
    throw new Error('FORBIDDEN: Sistemdeki tek Süper Admin’in rolü kaldırılamaz.')
  }

  const previousRole = target.role
  await db.runtime().execute(db.raw.sql`UPDATE users SET role = ${newRole}::"UserRole", updated_at = now() WHERE id = ${targetUserId}`.affectedCount().build() as never)

  await logAuditEvent({
    userId: actorUser.id,
    action: 'USER_ROLE_UPDATED',
    entity: 'User',
    entityId: targetUserId,
    metadata: { targetEmail: target.email, previousRole, newRole, actorEmail: actorUser.email },
  })
  return { ...target, role: newRole }
}

export async function adminUpdateUserStatus(params: {
  targetUserId: string
  newStatus: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE'
  actorUser: AuthUser
}): Promise<AdminUserListItem> {
  const { targetUserId, newStatus, actorUser } = params
  if (!STATUSES.includes(newStatus)) throw new Error('Geçersiz durum.')

  const target = await adminGetUserById(targetUserId)
  if (!target) throw new Error('Kullanıcı bulunamadı.')

  if (target.role === 'SUPER_ADMIN' && actorUser.role !== 'SUPER_ADMIN') {
    throw new Error('FORBIDDEN: Süper Admin hesabının durumu değiştirilemez.')
  }
  if (target.role === 'SUPER_ADMIN' && newStatus !== 'ACTIVE' && (await superAdminCount()) <= 1) {
    throw new Error('FORBIDDEN: Sistemdeki tek Süper Admin hesabı pasifleştirilemez.')
  }

  const previousStatus = target.status
  await db
    .runtime()
    .execute(db.raw.sql`UPDATE users SET status = ${newStatus}, is_active = ${newStatus === 'ACTIVE'}, updated_at = now() WHERE id = ${targetUserId}`.affectedCount().build() as never)

  await logAuditEvent({
    userId: actorUser.id,
    action: 'USER_STATUS_UPDATED',
    entity: 'User',
    entityId: targetUserId,
    metadata: { targetEmail: target.email, previousStatus, newStatus, actorEmail: actorUser.email },
  })
  return { ...target, status: newStatus }
}
