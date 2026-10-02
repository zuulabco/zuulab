import 'server-only'
import { db } from '@/prisma/db'
import { dbTimestampToIso, toDbTimestamp } from '@/lib/db/time'
import { logAuditEvent } from './admin.service'
import type { AuthUser } from './auth.service'
import { notifySupportTeam, sendSupportReplyEmail } from './notification/support-email'

/**
 * Customer support tickets, stored in Postgres only.
 *
 * Every message records its author (users.id) and side (CUSTOMER / STAFF /
 * SYSTEM). Internal staff notes are never returned to customers.
 */

export type TicketCategoryType = 'ORDER' | 'SHIPPING' | 'RETURN' | 'PRODUCT' | 'PAYMENT' | 'GENERAL'
export type TicketStatusType = 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED'
export type TicketChannel = 'ACCOUNT' | 'CONTACT_FORM'

export interface SupportMessageItem {
  id: string
  ticketId: string
  adminUserId: string | null
  authorName: string
  authorRole: 'CUSTOMER' | 'ADMIN' | 'SUPPORT'
  body: string
  isInternal: boolean
  attachments: string[]
  createdAt: string
}

export interface SupportTicketItem {
  id: string
  userId: string
  userName: string
  userEmail: string
  orderId: string | null
  orderNumber?: string | null
  category: TicketCategoryType
  subject: string
  status: TicketStatusType
  priority: number // 1: low, 2: medium, 3: high
  channel: TicketChannel
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
  messages?: SupportMessageItem[]
}

const STAFF_ROLES = new Set(['ADMIN', 'SUPER_ADMIN', 'SUPPORT'])
const CATEGORIES = new Set<TicketCategoryType>(['ORDER', 'SHIPPING', 'RETURN', 'PRODUCT', 'PAYMENT', 'GENERAL'])

function isStaff(user: Pick<AuthUser, 'role'>): boolean {
  return STAFF_ROLES.has(user.role)
}

function ticketQuery() {
  return db.orm.public.SupportTicket.include('user', (u) => u.select('id', 'name', 'email'))
}

type TicketRow = NonNullable<Awaited<ReturnType<ReturnType<typeof ticketQuery>['first']>>>

async function orderNumbersFor(orderIds: Array<string | null>): Promise<Map<string, string>> {
  const ids = [...new Set(orderIds.filter((id): id is string => Boolean(id)))]
  if (ids.length === 0) return new Map()
  const rows = await db.orm.public.Order.select('id', 'orderNumber').where((o) => o.id.in(ids)).all()
  return new Map(rows.map((r) => [r.id, r.orderNumber]))
}

function toTicketItem(t: TicketRow, orderNumbers: Map<string, string>): SupportTicketItem {
  return {
    id: t.id,
    userId: t.userId,
    userName: t.user?.name || t.user?.email?.split('@')[0] || 'Müşteri',
    userEmail: t.user?.email ?? '',
    orderId: t.orderId ?? null,
    orderNumber: t.orderId ? orderNumbers.get(t.orderId) ?? null : null,
    category: t.category as TicketCategoryType,
    subject: t.subject,
    status: t.status as TicketStatusType,
    priority: t.priority,
    channel: t.channel === 'CONTACT_FORM' ? 'CONTACT_FORM' : 'ACCOUNT',
    createdAt: dbTimestampToIso(t.createdAt) ?? '',
    updatedAt: dbTimestampToIso(t.updatedAt) ?? '',
    resolvedAt: dbTimestampToIso(t.resolvedAt),
  }
}

function validateMessage(text: string | undefined, min = 5): string {
  const body = (text ?? '').trim()
  if (body.length < min) throw new Error(`VALIDATION_ERROR: Mesajınız en az ${min} karakter olmalıdır.`)
  if (body.length > 5000) throw new Error('VALIDATION_ERROR: Mesajınız en fazla 5000 karakter olabilir.')
  return body
}

/**
 * Creates a support ticket for a customer (account panel) or for a contact-form
 * sender (`channel: 'CONTACT_FORM'`, user is the guest record for their email).
 */
export async function createTicket(
  user: { id: string; email: string; name?: string | null },
  payload: {
    subject: string
    category: TicketCategoryType
    priority?: number
    orderId?: string | null
    message: string
    channel?: TicketChannel
    phone?: string | null
  }
): Promise<SupportTicketItem> {
  const subject = (payload.subject ?? '').trim()
  if (subject.length < 3) throw new Error('VALIDATION_ERROR: Konu başlığı en az 3 karakter olmalıdır.')
  if (subject.length > 150) throw new Error('VALIDATION_ERROR: Konu başlığı en fazla 150 karakter olabilir.')
  const body = validateMessage(payload.message)
  const category = CATEGORIES.has(payload.category) ? payload.category : 'GENERAL'
  const priority = Math.min(3, Math.max(1, Math.round(payload.priority ?? 2)))
  const channel: TicketChannel = payload.channel === 'CONTACT_FORM' ? 'CONTACT_FORM' : 'ACCOUNT'

  // A linked order must belong to this customer.
  let orderId: string | null = null
  if (payload.orderId) {
    const order =
      (await db.orm.public.Order.select('id', 'userId').where({ id: payload.orderId }).first()) ??
      (await db.orm.public.Order.select('id', 'userId').where({ orderNumber: payload.orderId }).first())
    if (!order || order.userId !== user.id) {
      throw new Error('FORBIDDEN: Seçilen sipariş bu hesaba ait değil.')
    }
    orderId = order.id
  }

  const ticketId = await db.transaction(async (tx) => {
    const ticket = await tx.orm.public.SupportTicket.create({
      userId: user.id,
      orderId,
      category: category as never,
      subject,
      status: 'OPEN',
      priority,
      channel,
    })
    await tx.orm.public.SupportMessage.create({
      ticketId: ticket.id,
      authorUserId: user.id,
      authorType: 'CUSTOMER',
      body,
      isInternal: false,
      attachments: [],
    })
    return ticket.id
  })

  notifySupportTeam({
    ticketId,
    subject,
    category,
    channel,
    fromName: user.name || user.email,
    fromEmail: user.email,
    phone: payload.phone,
    message: body,
  }).catch((err) => console.error('[support.service] support inbox alert failed:', err))

  const row = await ticketQuery().where({ id: ticketId }).first()
  return { ...toTicketItem(row!, await orderNumbersFor([orderId])), messages: await loadMessages(ticketId, true) }
}

/**
 * Retrieves all tickets belonging to a customer, most recently active first
 */
export async function getCustomerTickets(userId: string): Promise<SupportTicketItem[]> {
  const rows = await ticketQuery().where({ userId }).orderBy((t) => t.updatedAt.desc()).limit(200).all()
  const orderNumbers = await orderNumbersFor(rows.map((r) => r.orderId ?? null))
  return rows.map((r) => toTicketItem(r, orderNumbers))
}

async function loadMessages(ticketId: string, includeInternal: boolean): Promise<SupportMessageItem[]> {
  let query = db.orm.public.SupportMessage
    .include('author', (a) => a.select('id', 'name', 'email'))
    .where({ ticketId })
  if (!includeInternal) query = query.where({ isInternal: false })
  const rows = await query.orderBy((m) => m.createdAt.asc()).all()

  return rows.map((m) => {
    const staffMessage = m.authorType === 'STAFF' || Boolean(m.adminUserId)
    return {
      id: m.id,
      ticketId: m.ticketId,
      adminUserId: staffMessage ? m.authorUserId ?? m.adminUserId ?? null : null,
      authorName: staffMessage
        ? includeInternal
          ? m.author?.name || m.author?.email || 'Zuulab Destek'
          : 'Zuulab Destek Ekibi'
        : m.author?.name || m.author?.email?.split('@')[0] || 'Müşteri',
      authorRole: staffMessage ? 'SUPPORT' : 'CUSTOMER',
      body: m.body,
      isInternal: Boolean(m.isInternal),
      attachments: (m.attachments as string[]) ?? [],
      createdAt: dbTimestampToIso(m.createdAt) ?? '',
    }
  })
}

/**
 * A ticket with its thread. Customers can only open their own tickets and never
 * see internal staff notes.
 */
export async function getTicketDetails(ticketId: string, user: AuthUser): Promise<SupportTicketItem> {
  const row = await ticketQuery().where({ id: ticketId }).first()
  if (!row) throw new Error('NOT_FOUND: Destek talebi bulunamadı.')

  const staff = isStaff(user)
  if (!staff && row.userId !== user.id) {
    throw new Error('FORBIDDEN: Bu destek talebine erişim yetkiniz bulunmamaktadır.')
  }

  return {
    ...toTicketItem(row, await orderNumbersFor([row.orderId ?? null])),
    messages: await loadMessages(ticketId, staff),
  }
}

/**
 * Adds a message to a ticket and moves its status:
 *  - staff public reply -> WAITING_CUSTOMER (customer is emailed)
 *  - customer reply to a waiting/resolved/closed ticket -> IN_PROGRESS
 */
export async function addMessageToTicket(
  ticketId: string,
  user: AuthUser,
  body: string,
  isInternal = false
): Promise<SupportMessageItem> {
  const ticket = await getTicketDetails(ticketId, user)
  const staff = isStaff(user)
  const internal = staff ? Boolean(isInternal) : false
  const text = validateMessage(body, 1)

  let newStatus: TicketStatusType = ticket.status
  if (staff && !internal) newStatus = 'WAITING_CUSTOMER'
  else if (!staff && ['WAITING_CUSTOMER', 'RESOLVED', 'CLOSED'].includes(ticket.status)) newStatus = 'IN_PROGRESS'

  const messageId = await db.transaction(async (tx) => {
    const message = await tx.orm.public.SupportMessage.create({
      ticketId,
      authorUserId: user.id,
      authorType: staff ? 'STAFF' : 'CUSTOMER',
      body: text,
      isInternal: internal,
      attachments: [],
    })
    await tx.orm.public.SupportTicket.where({ id: ticketId }).update({
      status: newStatus as never,
      resolvedAt: null,
    })
    return message.id
  })

  if (staff && !internal) {
    if (ticket.userEmail) {
      sendSupportReplyEmail({
        to: ticket.userEmail,
        ticketId,
        subject: ticket.subject,
        messageId,
        channel: ticket.channel,
        replyBody: text,
      }).catch((err) => console.error('[support.service] reply email failed:', err))
    }
    await db.orm.public.Notification.create({
      userId: ticket.userId,
      type: 'SUPPORT' as never,
      title: 'Destek Talebiniz Yanıtlandı',
      body: `"${ticket.subject}" konulu destek talebinize yeni bir yanıt verildi.`,
      data: { ticketId } as never,
    }).catch((err: unknown) => console.warn('[support.service] in-app notification failed:', err))
  }

  const messages = await loadMessages(ticketId, staff)
  return messages.find((m) => m.id === messageId)!
}

/**
 * Admin: lists tickets with optional filters, most recently active first
 */
export async function getAdminTickets(filters: {
  status?: TicketStatusType
  category?: TicketCategoryType
  search?: string
} = {}): Promise<SupportTicketItem[]> {
  let query = ticketQuery()
  if (filters.status) query = query.where({ status: filters.status as never })
  if (filters.category) query = query.where({ category: filters.category as never })
  const rows = await query.orderBy((t) => t.updatedAt.desc()).limit(500).all()

  const orderNumbers = await orderNumbersFor(rows.map((r) => r.orderId ?? null))
  let list = rows.map((r) => toTicketItem(r, orderNumbers))

  if (filters.search) {
    const q = filters.search.toLocaleLowerCase('tr-TR')
    list = list.filter(
      (t) =>
        t.subject.toLocaleLowerCase('tr-TR').includes(q) ||
        t.userEmail.toLowerCase().includes(q) ||
        t.userName.toLocaleLowerCase('tr-TR').includes(q) ||
        t.id.toLowerCase().includes(q) ||
        (t.orderNumber ?? '').toLowerCase().includes(q)
    )
  }
  return list
}

/**
 * Admin: updates a ticket's status and/or priority
 */
export async function updateTicketStatus(
  ticketId: string,
  adminUser: AuthUser,
  updates: { status?: TicketStatusType; priority?: number }
): Promise<SupportTicketItem> {
  const existing = await db.orm.public.SupportTicket.where({ id: ticketId }).first()
  if (!existing) throw new Error('NOT_FOUND: Destek talebi bulunamadı.')

  const fields: Record<string, unknown> = {}
  if (updates.status) {
    fields.status = updates.status
    fields.resolvedAt = updates.status === 'RESOLVED' || updates.status === 'CLOSED' ? toDbTimestamp() : null
  }
  if (updates.priority !== undefined) fields.priority = Math.min(3, Math.max(1, Math.round(updates.priority)))

  if (Object.keys(fields).length > 0) {
    await db.orm.public.SupportTicket.where({ id: ticketId }).update(fields as never)
  }

  await logAuditEvent({
    userId: adminUser.id,
    action: 'SUPPORT_TICKET_UPDATED',
    entity: 'SupportTicket',
    entityId: ticketId,
    metadata: { ...updates },
  })

  return getTicketDetails(ticketId, adminUser)
}
