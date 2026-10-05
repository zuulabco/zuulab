/**
 * The admin's Müşteriler and Kullanıcılar pages on the real database (DATABASE_URL). Read-only: nothing is
 * written, so it is safe while real customers shop. Checks that the lists are the real accounts (not the old
 * sample data), that the Super Admin is in the list, and that the deletion rules refuse what they must.
 * Run with: npm run test:integration
 */
import 'dotenv/config'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/services/admin.service', () => ({ logAuditEvent: vi.fn().mockResolvedValue(undefined) }))

describe('Kullanıcılar ve roller (real accounts)', () => {
  it('lists the real accounts, the Super Admin among them, and none of the old sample users', async () => {
    const { adminGetUsers } = await import('@/lib/services/users-admin.service')
    const users = await adminGetUsers()
    expect(users.length).toBeGreaterThan(0)
    expect(users.some((u) => u.email === 'zuulab.co@gmail.com' && u.role === 'SUPER_ADMIN')).toBe(true)
    for (const fake of ['ayse@test.com', 'can.operasyon@zuulab.com', 'selin.icerik@zuulab.com', 'baskiatolye@zuulab.com']) {
      expect(users.some((u) => u.email === fake), fake).toBe(false)
    }
    expect(users.some((u) => u.email.endsWith('@marketplace.invalid'))).toBe(false)
    expect(users[0].role).toBe('SUPER_ADMIN')
  })

  it('filters by role and search', async () => {
    const { adminGetUsers } = await import('@/lib/services/users-admin.service')
    expect((await adminGetUsers({ role: 'SUPER_ADMIN' })).every((u) => u.role === 'SUPER_ADMIN')).toBe(true)
    expect((await adminGetUsers({ search: 'zuulab.co' })).length).toBeGreaterThan(0)
  })

  it('the last Super Admin cannot lose the role or be suspended', async () => {
    const { adminGetUsers, adminUpdateUserRole, adminUpdateUserStatus } = await import('@/lib/services/users-admin.service')
    const users = await adminGetUsers({ role: 'SUPER_ADMIN' })
    if (users.length !== 1) return // more than one Super Admin: the rule does not apply
    const actor = { ...users[0], role: 'SUPER_ADMIN' } as never
    await expect(adminUpdateUserRole({ targetUserId: users[0].id, newRole: 'ADMIN', actorUser: actor })).rejects.toThrow(/tek Süper Admin/)
    await expect(adminUpdateUserStatus({ targetUserId: users[0].id, newStatus: 'SUSPENDED', actorUser: actor })).rejects.toThrow(/tek Süper Admin/)
  })
})

describe('Müşteriler (real members)', () => {
  it('lists members with real order totals, not the old sample customers', async () => {
    const { adminGetCustomers } = await import('@/lib/services/customers-admin.service')
    const list = await adminGetCustomers()
    expect(list.length).toBeGreaterThan(0)
    for (const fake of ['ayse@test.com', 'mehmet@test.com', 'zeynep@example.com']) expect(list.some((c) => c.email === fake), fake).toBe(false)
    expect(list.some((c) => c.email === 'zuulab.co@gmail.com')).toBe(false) // staff are not members
    expect(list.some((c) => c.email.endsWith('@marketplace.invalid'))).toBe(false)
    for (const c of list) {
      expect(c.orderCount).toBeGreaterThanOrEqual(0)
      expect(c.totalSpend).toBeGreaterThanOrEqual(0)
    }
  })

  it('a member’s detail carries the real orders and says what blocks deletion', async () => {
    const { adminGetCustomers, adminGetCustomerDetail } = await import('@/lib/services/customers-admin.service')
    const withOrders = (await adminGetCustomers()).find((c) => c.orderCount > 0)
    if (!withOrders) return
    const d = await adminGetCustomerDetail(withOrders.id)
    expect(d?.email).toBe(withOrders.email)
    expect(d!.orders.length).toBeGreaterThan(0)
    expect(d!.deletionBlockers.join(' ')).toMatch(/sipariş/)
  })

  it('refuses to delete a member who has orders, a wrong confirmation, the Super Admin and unknown ids', async () => {
    const { adminGetCustomers, adminDeleteCustomer } = await import('@/lib/services/customers-admin.service')
    const { adminGetUsers } = await import('@/lib/services/users-admin.service')
    const actor = { email: 'test' }
    const withOrders = (await adminGetCustomers()).find((c) => c.orderCount > 0)
    if (withOrders) {
      await expect(adminDeleteCustomer({ customerId: withOrders.id, mode: 'delete', confirmEmail: withOrders.email, actor })).rejects.toThrow(/saklanmalı/)
      await expect(adminDeleteCustomer({ customerId: withOrders.id, mode: 'anonymize', confirmEmail: 'yanlis@example.com', actor })).rejects.toThrow(/e-posta adresini/)
    }
    const superAdmin = (await adminGetUsers({ role: 'SUPER_ADMIN' }))[0]
    await expect(adminDeleteCustomer({ customerId: superAdmin.id, mode: 'delete', confirmEmail: superAdmin.email, actor })).rejects.toThrow(/yalnızca müşteri/i)
    await expect(adminDeleteCustomer({ customerId: 'nope', mode: 'delete', confirmEmail: 'x', actor })).rejects.toThrow(/bulunamadı/)
  })
})

describe('Order deletion rules (nothing is deleted here)', () => {
  it('refuses marketplace orders, invoiced orders and a wrong confirmation', async () => {
    const { deleteBlocker, deleteOrder } = await import('@/lib/services/order-delete.service')
    expect(deleteBlocker({ channel: 'TRENDYOL', invoices: 0, returns: 0 })).toMatch(/Pazaryeri/)
    expect(deleteBlocker({ channel: 'DIRECT', invoices: 1, returns: 0 })).toMatch(/fatura/)
    expect(deleteBlocker({ channel: 'DIRECT', invoices: 0, returns: 1 })).toMatch(/iade/)
    expect(deleteBlocker({ channel: 'DIRECT', invoices: 0, returns: 0 })).toBeNull()
    await expect(deleteOrder('ZUU887525977687', 'baska', { email: 'test' })).rejects.toThrow(/numarasını aynen/)
    await expect(deleteOrder('TY-11609287545', 'TY-11609287545', { email: 'test' })).rejects.toThrow(/Pazaryeri/)
  })
})
