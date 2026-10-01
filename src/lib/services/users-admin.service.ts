import 'server-only'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { type AuthUser } from './auth.service'
import { logAuditEvent } from './admin.service'
import { getAllOrders } from './orders.service'

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

// In-memory initial users covering realistic studio administrative and team roles
const initialAdminUsers: AdminUserListItem[] = [
  {
    id: 'usr-admin-demo',
    firebaseUid: 'admin-firebase-uid',
    email: 'admin@zuulab.com',
    name: 'Zuulab Super Admin',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    orderCount: 0,
    lastLoginAt: new Date().toISOString(),
    createdAt: new Date(Date.now() - 3600000 * 24 * 120).toISOString(),
  },
  {
    id: 'usr-ops-lead',
    firebaseUid: 'ops-lead-uid',
    email: 'can.operasyon@zuulab.com',
    name: 'Can Ertekin',
    role: 'ORDER_MANAGER',
    status: 'ACTIVE',
    orderCount: 1,
    lastLoginAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    createdAt: new Date(Date.now() - 3600000 * 24 * 90).toISOString(),
  },
  {
    id: 'usr-content-curator',
    firebaseUid: 'content-curator-uid',
    email: 'selin.icerik@zuulab.com',
    name: 'Selin Yılmaz',
    role: 'CONTENT_MANAGER',
    status: 'ACTIVE',
    orderCount: 0,
    lastLoginAt: new Date(Date.now() - 3600000 * 8).toISOString(),
    createdAt: new Date(Date.now() - 3600000 * 24 * 60).toISOString(),
  },
  {
    id: 'usr-support-agent',
    firebaseUid: 'support-agent-uid',
    email: 'destek@zuulab.com',
    name: 'Emir Destek',
    role: 'SUPPORT',
    status: 'ACTIVE',
    orderCount: 0,
    lastLoginAt: new Date(Date.now() - 3600000 * 18).toISOString(),
    createdAt: new Date(Date.now() - 3600000 * 24 * 45).toISOString(),
  },
  {
    id: 'usr-workshop-tech',
    firebaseUid: 'workshop-tech-uid',
    email: 'baskiatolye@zuulab.com',
    name: 'Burak Usta',
    role: 'STAFF',
    status: 'ACTIVE',
    orderCount: 0,
    lastLoginAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    createdAt: new Date(Date.now() - 3600000 * 24 * 30).toISOString(),
  },
  {
    id: 'usr-cust-1',
    firebaseUid: 'cust-1-uid',
    email: 'ayse@test.com',
    name: 'Ayşe Kaya',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    orderCount: 3,
    lastLoginAt: new Date(Date.now() - 3600000 * 24 * 3).toISOString(),
    createdAt: new Date(Date.now() - 3600000 * 24 * 30).toISOString(),
  },
]

let inMemoryUsersList: AdminUserListItem[] = [...initialAdminUsers]

export async function adminGetUsers(filters?: {
  role?: string
  status?: string
  search?: string
}): Promise<AdminUserListItem[]> {
  if (isDatabaseConfigured) {
    try {
      const dbUsers = await (db.orm.public.User as any).where({}).all()
      if (dbUsers && dbUsers.length > 0) {
        const orders = await getAllOrders()
        let result: AdminUserListItem[] = dbUsers.map((u: any) => ({
          id: u.id,
          firebaseUid: u.firebaseUid,
          email: u.email,
          name: u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || null,
          role: (u.role as AuthUser['role']) || 'CUSTOMER',
          status: (u.status as 'ACTIVE' | 'SUSPENDED' | 'INACTIVE') || (u.isActive ? 'ACTIVE' : 'INACTIVE'),
          orderCount: orders.filter((o) => o.userId === u.id || o.customerEmail === u.email).length,
          lastLoginAt: u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : null,
          createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : new Date().toISOString(),
        }))

        if (filters?.role && filters.role !== 'ALL') {
          result = result.filter((u) => u.role === filters.role)
        }
        if (filters?.status && filters.status !== 'ALL') {
          result = result.filter((u) => u.status === filters.status)
        }
        if (filters?.search) {
          const q = filters.search.toLowerCase()
          result = result.filter(
            (u) =>
              u.email.toLowerCase().includes(q) ||
              (u.name && u.name.toLowerCase().includes(q))
          )
        }
        return result
      }
    } catch (err) {
      console.warn('[users-admin.service] DB fetch failed, falling back to memory:', err)
    }
  }

  let list = [...inMemoryUsersList]
  if (filters?.role && filters.role !== 'ALL') {
    list = list.filter((u) => u.role === filters.role)
  }
  if (filters?.status && filters.status !== 'ALL') {
    list = list.filter((u) => u.status === filters.status)
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase()
    list = list.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.name && u.name.toLowerCase().includes(q))
    )
  }
  return list
}

export async function adminGetUserById(id: string): Promise<AdminUserListItem | null> {
  const users = await adminGetUsers()
  return users.find((u) => u.id === id) || null
}

export async function adminUpdateUserRole(params: {
  targetUserId: string
  newRole: AuthUser['role']
  actorUser: AuthUser
}): Promise<AdminUserListItem> {
  const { targetUserId, newRole, actorUser } = params

  const target = inMemoryUsersList.find((u) => u.id === targetUserId)
  if (!target) {
    throw new Error('Kullanıcı bulunamadı.')
  }

  // Guard: Only SUPER_ADMIN can assign or modify SUPER_ADMIN role
  if (newRole === 'SUPER_ADMIN' && actorUser.role !== 'SUPER_ADMIN') {
    throw new Error('FORBIDDEN: Süper Admin rolünü yalnızca mevcut bir Süper Admin atayabilir.')
  }
  if (target.role === 'SUPER_ADMIN' && actorUser.role !== 'SUPER_ADMIN') {
    throw new Error('FORBIDDEN: Süper Admin kullanıcısının rolü yalnızca başka bir Süper Admin tarafından değiştirilebilir.')
  }

  // Prevent self demotion if last SUPER_ADMIN
  if (target.id === actorUser.id && target.role === 'SUPER_ADMIN' && newRole !== 'SUPER_ADMIN') {
    const superAdminCount = inMemoryUsersList.filter((u) => u.role === 'SUPER_ADMIN').length
    if (superAdminCount <= 1) {
      throw new Error('FORBIDDEN: Sistemdeki tek Süper Admin rolünü kendinizden kaldıramazsınız.')
    }
  }

  const previousRole = target.role
  target.role = newRole

  if (isDatabaseConfigured) {
    try {
      await db.orm.public.User.where({ id: targetUserId }).update({
        role: newRole,
      })
    } catch (err) {
      console.warn('[users-admin.service] DB role update failed:', err)
    }
  }

  await logAuditEvent({
    userId: actorUser.id,
    action: 'USER_ROLE_UPDATED',
    entity: 'User',
    entityId: targetUserId,
    metadata: {
      targetEmail: target.email,
      previousRole,
      newRole,
      actorEmail: actorUser.email,
    },
  })

  return target
}

export async function adminUpdateUserStatus(params: {
  targetUserId: string
  newStatus: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE'
  actorUser: AuthUser
}): Promise<AdminUserListItem> {
  const { targetUserId, newStatus, actorUser } = params

  const target = inMemoryUsersList.find((u) => u.id === targetUserId)
  if (!target) {
    throw new Error('Kullanıcı bulunamadı.')
  }

  if (target.role === 'SUPER_ADMIN' && actorUser.role !== 'SUPER_ADMIN') {
    throw new Error('FORBIDDEN: Süper Admin hesabının durumu değiştirilemez.')
  }

  const previousStatus = target.status
  target.status = newStatus

  if (isDatabaseConfigured) {
    try {
      await db.orm.public.User.where({ id: targetUserId }).update({
        status: newStatus,
        isActive: newStatus === 'ACTIVE',
      })
    } catch (err) {
      console.warn('[users-admin.service] DB status update failed:', err)
    }
  }

  await logAuditEvent({
    userId: actorUser.id,
    action: 'USER_STATUS_UPDATED',
    entity: 'User',
    entityId: targetUserId,
    metadata: {
      targetEmail: target.email,
      previousStatus,
      newStatus,
      actorEmail: actorUser.email,
    },
  })

  return target
}
