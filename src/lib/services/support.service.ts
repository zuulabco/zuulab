import 'server-only'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { logAuditEvent } from './admin.service'
import type { AuthUser } from './auth.service'

export type TicketCategoryType = 'ORDER' | 'SHIPPING' | 'RETURN' | 'PRODUCT' | 'PAYMENT' | 'GENERAL'
export type TicketStatusType = 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED'

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
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
  messages?: SupportMessageItem[]
}

// In-memory fallback support storage for dev / testing
const inMemoryTickets: Map<string, SupportTicketItem> = new Map()
const inMemoryMessages: Map<string, SupportMessageItem[]> = new Map()

/**
 * Creates a support ticket for an authenticated customer
 */
export async function createTicket(
  user: { id: string; email: string; name?: string | null },
  payload: {
    subject: string
    category: TicketCategoryType
    priority?: number
    orderId?: string | null
    message: string
  }
): Promise<SupportTicketItem> {
  const { subject, category, priority = 2, orderId, message } = payload

  if (!subject || subject.trim().length < 3) {
    throw new Error('VALIDATION_ERROR: Konu başlığı en az 3 karakter olmalıdır.')
  }
  if (!message || message.trim().length < 5) {
    throw new Error('VALIDATION_ERROR: Mesajınız en az 5 karakter olmalıdır.')
  }

  // If orderId is supplied, verify server-side that the order belongs to this customer
  let verifiedOrderId: string | null = null
  let verifiedOrderNumber: string | null = null

  if (orderId) {
    const { getUserOrders } = await import('./orders.service')
    const userOrders = await getUserOrders(user.id)
    const match = userOrders.find((o) => o.id === orderId || o.orderNumber === orderId)
    if (!match) {
      throw new Error('FORBIDDEN: Seçilen sipariş bu hesaba ait değil.')
    }
    verifiedOrderId = match.id
    verifiedOrderNumber = match.orderNumber
  }

  const now = new Date().toISOString()
  const ticketId = `tck-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const msgId = `msg-${Date.now()}-1`

  const initialMessage: SupportMessageItem = {
    id: msgId,
    ticketId,
    adminUserId: null,
    authorName: user.name || user.email.split('@')[0],
    authorRole: 'CUSTOMER',
    body: message.trim(),
    isInternal: false,
    attachments: [],
    createdAt: now,
  }

  const ticket: SupportTicketItem = {
    id: ticketId,
    userId: user.id,
    userName: user.name || user.email.split('@')[0],
    userEmail: user.email,
    orderId: verifiedOrderId,
    orderNumber: verifiedOrderNumber,
    category,
    subject: subject.trim(),
    status: 'OPEN',
    priority,
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
    messages: [initialMessage],
  }

  // 1. Persist to PostgreSQL if configured
  if (isDatabaseConfigured) {
    try {
      const created = await db.orm.public.SupportTicket.create({
        userId: user.id,
        orderId: verifiedOrderId,
        category: category as any,
        subject: subject.trim(),
        status: 'OPEN',
        priority,
      })

      await db.orm.public.SupportMessage.create({
        ticketId: created.id,
        body: message.trim(),
        isInternal: false,
        attachments: [],
      })

      return {
        ...ticket,
        id: created.id,
      }
    } catch (err) {
      console.warn('[support.service] DB ticket creation failed, using fallback:', err)
    }
  }

  inMemoryTickets.set(ticketId, ticket)
  inMemoryMessages.set(ticketId, [initialMessage])

  return ticket
}

/**
 * Retrieves all tickets belonging to a customer
 */
export async function getCustomerTickets(userId: string): Promise<SupportTicketItem[]> {
  if (isDatabaseConfigured) {
    try {
      const records = await db.orm.public.SupportTicket.where({ userId }).all()
      if (records && records.length > 0) {
        return records.map((r) => ({
          id: r.id,
          userId: r.userId,
          userName: 'Müşteri',
          userEmail: '',
          orderId: r.orderId,
          category: r.category as TicketCategoryType,
          subject: r.subject,
          status: r.status as TicketStatusType,
          priority: r.priority,
          createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
          updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : new Date().toISOString(),
          resolvedAt: r.resolvedAt ? new Date(r.resolvedAt).toISOString() : null,
        })).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      }
    } catch (err) {
      console.warn('[support.service] DB customer tickets fetch failed, using fallback:', err)
    }
  }

  return Array.from(inMemoryTickets.values())
    .filter((t) => t.userId === userId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

/**
 * Retrieves a single ticket and its message thread with customer isolation & internal note filtration
 */
export async function getTicketDetails(
  ticketId: string,
  user: AuthUser
): Promise<SupportTicketItem> {
  let ticket: SupportTicketItem | null = null
  let messages: SupportMessageItem[] = []

  // Check DB if configured
  if (isDatabaseConfigured) {
    try {
      const t = await db.orm.public.SupportTicket.where({ id: ticketId }).first()
      if (t) {
        ticket = {
          id: t.id,
          userId: t.userId,
          userName: 'Müşteri',
          userEmail: '',
          orderId: t.orderId,
          category: t.category as TicketCategoryType,
          subject: t.subject,
          status: t.status as TicketStatusType,
          priority: t.priority,
          createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : new Date().toISOString(),
          updatedAt: t.updatedAt ? new Date(t.updatedAt).toISOString() : new Date().toISOString(),
          resolvedAt: t.resolvedAt ? new Date(t.resolvedAt).toISOString() : null,
        }

        const msgs = await db.orm.public.SupportMessage.where({ ticketId }).all()
        messages = msgs.map((m) => ({
          id: m.id,
          ticketId: m.ticketId,
          adminUserId: m.adminUserId,
          authorName: m.adminUserId ? 'Zuulab Destek Ekibi' : 'Siz',
          authorRole: m.adminUserId ? 'SUPPORT' : 'CUSTOMER',
          body: m.body,
          isInternal: Boolean(m.isInternal),
          attachments: (m.attachments as string[]) || [],
          createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString(),
        }))
      }
    } catch (err) {
      console.warn('[support.service] DB ticket detail fetch failed, using fallback:', err)
    }
  }

  if (!ticket) {
    ticket = inMemoryTickets.get(ticketId) || null
    messages = inMemoryMessages.get(ticketId) || []
  }

  if (!ticket) {
    throw new Error('NOT_FOUND: Destek talebi bulunamadı.')
  }

  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' || user.role === 'SUPPORT'

  // Strict Customer Isolation: Customer can only access their own ticket!
  if (!isAdmin && ticket.userId !== user.id) {
    throw new Error('FORBIDDEN: Bu destek talebine erişim yetkiniz bulunmamaktadır.')
  }

  // Filter out internal messages for customers!
  const filteredMessages = isAdmin
    ? messages
    : messages.filter((m) => !m.isInternal)

  return {
    ...ticket,
    messages: filteredMessages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
  }
}

/**
 * Adds a message to an existing ticket
 */
export async function addMessageToTicket(
  ticketId: string,
  user: AuthUser,
  body: string,
  isInternal = false
): Promise<SupportMessageItem> {
  const ticket = await getTicketDetails(ticketId, user)
  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' || user.role === 'SUPPORT'

  // Non-admins cannot post internal messages
  const effectiveIsInternal = isAdmin ? Boolean(isInternal) : false

  if (!body || body.trim().length === 0) {
    throw new Error('VALIDATION_ERROR: Mesaj boş olamaz.')
  }

  const now = new Date().toISOString()
  const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

  const newMsg: SupportMessageItem = {
    id: msgId,
    ticketId,
    adminUserId: isAdmin ? user.id : null,
    authorName: isAdmin ? (user.name || 'Zuulab Destek') : (user.name || 'Siz'),
    authorRole: isAdmin ? 'SUPPORT' : 'CUSTOMER',
    body: body.trim(),
    isInternal: effectiveIsInternal,
    attachments: [],
    createdAt: now,
  }

  // State transitions:
  // If customer replies, status becomes IN_PROGRESS or OPEN
  // If admin replies publicly, status becomes WAITING_CUSTOMER
  let newStatus: TicketStatusType = ticket.status
  if (isAdmin && !effectiveIsInternal) {
    newStatus = 'WAITING_CUSTOMER'
  } else if (!isAdmin && (ticket.status === 'WAITING_CUSTOMER' || ticket.status === 'RESOLVED')) {
    newStatus = 'IN_PROGRESS'
  }

  if (isDatabaseConfigured) {
    try {
      await db.orm.public.SupportMessage.create({
        ticketId,
        adminUserId: isAdmin ? user.id : null,
        body: body.trim(),
        isInternal: effectiveIsInternal,
        attachments: [],
      })

      await db.orm.public.SupportTicket.where({ id: ticketId }).update({
        status: newStatus as any,
        updatedAt: new Date(),
      })
    } catch (err) {
      console.warn('[support.service] DB add message failed, using fallback:', err)
    }
  }

  // Fallback in-memory
  const msgs = inMemoryMessages.get(ticketId) || []
  msgs.push(newMsg)
  inMemoryMessages.set(ticketId, msgs)

  const storedTicket = inMemoryTickets.get(ticketId)
  if (storedTicket) {
    inMemoryTickets.set(ticketId, {
      ...storedTicket,
      status: newStatus,
      updatedAt: now,
    })
  }

  // If admin replied publicly, notify customer
  if (isAdmin && !effectiveIsInternal && isDatabaseConfigured) {
    try {
      await db.orm.public.Notification.create({
        userId: ticket.userId,
        type: 'SUPPORT' as any,
        title: 'Destek Talebiniz Yanıtlandı',
        body: `"${ticket.subject}" konulu destek talebinize yeni bir yanıt verildi.`,
        data: { ticketId } as any,
      })
    } catch (err) {
      console.warn('[support.service] Error creating support notification:', err)
    }
  }

  return newMsg
}

/**
 * Admin: Lists all tickets with optional filtering
 */
export async function getAdminTickets(filters: {
  status?: TicketStatusType
  category?: TicketCategoryType
  search?: string
} = {}): Promise<SupportTicketItem[]> {
  if (isDatabaseConfigured) {
    try {
      const query: any = {}
      if (filters.status) query.status = filters.status
      if (filters.category) query.category = filters.category

      const records = await db.orm.public.SupportTicket.where(query).all()
      if (records && records.length > 0) {
        return records.map((r) => ({
          id: r.id,
          userId: r.userId,
          userName: 'Müşteri',
          userEmail: '',
          orderId: r.orderId,
          category: r.category as TicketCategoryType,
          subject: r.subject,
          status: r.status as TicketStatusType,
          priority: r.priority,
          createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
          updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : new Date().toISOString(),
          resolvedAt: r.resolvedAt ? new Date(r.resolvedAt).toISOString() : null,
        })).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      }
    } catch (err) {
      console.warn('[support.service] DB admin tickets fetch failed, using fallback:', err)
    }
  }

  let list = Array.from(inMemoryTickets.values())
  if (filters.status) {
    list = list.filter((t) => t.status === filters.status)
  }
  if (filters.category) {
    list = list.filter((t) => t.category === filters.category)
  }
  if (filters.search) {
    const s = filters.search.toLowerCase()
    list = list.filter(
      (t) =>
        t.subject.toLowerCase().includes(s) ||
        t.userEmail.toLowerCase().includes(s) ||
        t.id.toLowerCase().includes(s)
    )
  }

  return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

/**
 * Admin: Updates ticket status or priority
 */
export async function updateTicketStatus(
  adminUserId: string,
  ticketId: string,
  updates: { status?: TicketStatusType; priority?: number }
): Promise<SupportTicketItem> {
  const { status, priority } = updates
  const now = new Date().toISOString()

  if (isDatabaseConfigured) {
    try {
      const patch: any = { updatedAt: new Date() }
      if (status) {
        patch.status = status
        if (status === 'RESOLVED' || status === 'CLOSED') {
          patch.resolvedAt = new Date()
        }
      }
      if (priority !== undefined) patch.priority = priority

      await db.orm.public.SupportTicket.where({ id: ticketId }).update(patch)
    } catch (err) {
      console.warn('[support.service] DB update ticket status failed, using fallback:', err)
    }
  }

  const ticket = inMemoryTickets.get(ticketId)
  if (!ticket) {
    throw new Error('NOT_FOUND: Destek talebi bulunamadı.')
  }

  const updated: SupportTicketItem = {
    ...ticket,
    ...(status && { status }),
    ...(priority !== undefined && { priority }),
    ...(status === 'RESOLVED' || status === 'CLOSED' ? { resolvedAt: now } : {}),
    updatedAt: now,
  }

  inMemoryTickets.set(ticketId, updated)

  await logAuditEvent({
    userId: adminUserId,
    action: 'support_ticket.status_changed',
    entity: 'SupportTicket',
    entityId: ticketId,
    metadata: { status, priority },
  })

  // Notify customer if status resolved
  if (status === 'RESOLVED' && isDatabaseConfigured) {
    try {
      await db.orm.public.Notification.create({
        userId: ticket.userId,
        type: 'SUPPORT' as any,
        title: 'Destek Talebiniz Çözüldü',
        body: `"${ticket.subject}" konulu destek talebiniz çözümlendi olarak işaretlendi.`,
        data: { ticketId } as any,
      })
    } catch (err) {
      console.warn('[support.service] Error creating support notification:', err)
    }
  }

  return updated
}
