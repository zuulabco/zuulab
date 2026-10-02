/**
 * Customer account and support flows against the real database.
 * All rows created here belong to two run-tagged users and are removed in afterAll.
 */
import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/services/admin.service', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}))
const emails = vi.hoisted(() => ({ replies: [] as unknown[], team: [] as unknown[] }))
vi.mock('@/lib/services/notification/support-email', () => ({
  sendSupportReplyEmail: vi.fn(async (p: unknown) => { emails.replies.push(p); return true }),
  notifySupportTeam: vi.fn(async (p: unknown) => { emails.team.push(p); return true }),
}))

const { db } = await import('@/prisma/db')
const addresses = await import('@/lib/services/address.service')
const support = await import('@/lib/services/support.service')
const { checkRateLimit } = await import('@/lib/security/rate-limiter')

const RUN = `itacc${Date.now().toString(36)}`
let customer: { id: string; email: string; name: string; role: 'CUSTOMER' }
let staff: { id: string; email: string; name: string; role: 'SUPPORT' }

const address = {
  title: 'Ev',
  firstName: 'Test',
  lastName: 'Müşteri',
  phone: '05551112233',
  addressLine1: 'Deneme Mahallesi Test Sokak No 1',
  city: 'İstanbul',
  district: 'Kadıköy',
  postalCode: '34000',
}

beforeAll(async () => {
  const c = await db.orm.public.User.create({ email: `${RUN}@example.com`, name: 'Test Müşteri', role: 'CUSTOMER', status: 'ACTIVE' } as never)
  const s = await db.orm.public.User.create({ email: `${RUN}-staff@example.com`, name: 'Destek Uzmanı', role: 'SUPPORT', status: 'ACTIVE' } as never)
  customer = { id: c.id, email: c.email, name: 'Test Müşteri', role: 'CUSTOMER' }
  staff = { id: s.id, email: s.email, name: 'Destek Uzmanı', role: 'SUPPORT' }
}, 60_000)

afterAll(async () => {
  const run = (plan: Parameters<ReturnType<typeof db.runtime>['execute']>[0]) => db.runtime().execute(plan)
  for (const id of [customer?.id, staff?.id].filter(Boolean) as string[]) {
    await run(db.raw.sql`DELETE FROM notifications WHERE user_id = ${id}`.affectedCount().build())
    await run(db.raw.sql`DELETE FROM support_messages WHERE ticket_id IN (SELECT id FROM support_tickets WHERE user_id = ${id})`.affectedCount().build())
    await run(db.raw.sql`DELETE FROM support_messages WHERE author_user_id = ${id}`.affectedCount().build())
    await run(db.raw.sql`DELETE FROM support_tickets WHERE user_id = ${id}`.affectedCount().build())
    await run(db.raw.sql`DELETE FROM addresses WHERE user_id = ${id}`.affectedCount().build())
    await run(db.raw.sql`DELETE FROM users WHERE id = ${id}`.affectedCount().build())
  }
  await run(db.raw.sql`DELETE FROM rate_limits WHERE key LIKE ${`test:${RUN}%`}`.affectedCount().build())
  await db.close()
}, 60_000)

describe('address book', () => {
  it('keeps exactly one default through create, set-default and delete', async () => {
    const first = await addresses.createAddress(customer.id, address)
    expect(first.isDefault).toBe(true)

    const second = await addresses.createAddress(customer.id, { ...address, title: 'İş' })
    expect(second.isDefault).toBe(false)

    await addresses.setDefaultAddress(customer.id, second.id)
    let list = await addresses.getUserAddresses(customer.id)
    expect(list.filter((a) => a.isDefault).map((a) => a.id)).toEqual([second.id])
    expect(list[0].id).toBe(second.id)
    expect(list[0].createdAt).not.toBe('')

    await addresses.deleteAddress(customer.id, second.id)
    list = await addresses.getUserAddresses(customer.id)
    expect(list.map((a) => [a.id, a.isDefault])).toEqual([[first.id, true]])
  }, 60_000)

  it('refuses another user\'s address', async () => {
    const [mine] = await addresses.getUserAddresses(customer.id)
    await expect(addresses.setDefaultAddress(staff.id, mine.id)).rejects.toThrow(/NOT_FOUND/)
    await expect(addresses.deleteAddress(staff.id, mine.id)).rejects.toThrow(/NOT_FOUND/)
  }, 60_000)
})

describe('support tickets', () => {
  it('stores the thread with authors, hides internal notes from the customer, and notifies', async () => {
    const ticket = await support.createTicket(customer, {
      subject: 'Siparişim hakkında',
      category: 'ORDER',
      message: 'Kargom ne zaman çıkar?',
    })
    expect(ticket.status).toBe('OPEN')
    expect(emails.team.length).toBe(1)

    await support.addMessageToTicket(ticket.id, staff as never, 'İç not: üretimde', true)
    await support.addMessageToTicket(ticket.id, staff as never, 'Yarın kargoya verilecek.', false)

    const customerView = await support.getTicketDetails(ticket.id, customer as never)
    expect(customerView.status).toBe('WAITING_CUSTOMER')
    expect(customerView.messages?.map((m) => [m.authorRole, m.body])).toEqual([
      ['CUSTOMER', 'Kargom ne zaman çıkar?'],
      ['SUPPORT', 'Yarın kargoya verilecek.'],
    ])
    expect(customerView.messages?.[1].authorName).toBe('Zuulab Destek Ekibi')
    expect(emails.replies.length).toBe(1)

    const staffView = await support.getTicketDetails(ticket.id, staff as never)
    expect(staffView.messages?.length).toBe(3)
    expect(staffView.userEmail).toBe(customer.email)

    await support.addMessageToTicket(ticket.id, customer as never, 'Teşekkürler!')
    expect((await support.getTicketDetails(ticket.id, customer as never)).status).toBe('IN_PROGRESS')

    const resolved = await support.updateTicketStatus(ticket.id, staff as never, { status: 'RESOLVED' })
    expect(resolved.resolvedAt).not.toBeNull()
  }, 60_000)

  it('keeps customers out of other customers\' tickets', async () => {
    const [ticket] = await support.getCustomerTickets(customer.id)
    const stranger = { id: staff.id, email: staff.email, name: 'x', role: 'CUSTOMER' }
    await expect(support.getTicketDetails(ticket.id, stranger as never)).rejects.toThrow(/FORBIDDEN/)
  }, 60_000)
})

describe('rate limiter', () => {
  it('counts across calls and blocks past the limit', async () => {
    const key = `test:${RUN}:limit`
    const results = []
    for (let i = 0; i < 4; i++) results.push(await checkRateLimit(key, 3, 60))
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false])
    expect(results[3].remaining).toBe(0)
  }, 60_000)

  it('is atomic under concurrency', async () => {
    const key = `test:${RUN}:concurrent`
    const results = await Promise.all(Array.from({ length: 10 }, () => checkRateLimit(key, 5, 60)))
    expect(results.filter((r) => r.allowed).length).toBe(5)
  }, 60_000)
})
