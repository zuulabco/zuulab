import 'server-only'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { getOrderByNumber } from '../orders.service'
import { logAuditEvent } from '../admin.service'
import { getEmailProvider } from './email-provider.factory'
import { generateEmailTemplate } from './templates/template.registry'
import type {
  StoredNotification,
  NotificationEventType,
  NotificationStatus,
} from './notification.interface'

const inMemoryNotifications: StoredNotification[] = []
const inFlightDispatches = new Map<string, Promise<StoredNotification>>()

export const MAX_NOTIFICATION_RETRIES = 3

/**
 * Creates a notification record for a business domain event.
 * Uses deterministic idempotencyKey to prevent duplicate emails.
 * Never blocks the main business logic (Order, Payment, Shipping).
 */
export async function createNotification(params: {
  orderNumber: string
  eventType: NotificationEventType
  recipientEmail?: string
  recipient?: string
  metadata?: Record<string, unknown>
  templateData?: Record<string, unknown>
  asyncDispatch?: boolean
  immediate?: boolean
  idempotencyKey?: string
}): Promise<StoredNotification> {
  const fetchedOrder = await getOrderByNumber(params.orderNumber, undefined, true)
  const order: any = fetchedOrder || {
    id: `ord_${params.orderNumber}`,
    orderNumber: params.orderNumber,
    userId: 'usr_guest',
    totalAmount: 0,
    shippingAddressSnapshot: { fullName: 'Değerli Müşterimiz' },
    items: [],
    customerEmail: params.recipientEmail || params.recipient || 'musteri@zuulab.com',
    createdAt: new Date().toISOString(),
  }

  const recipient =
    params.recipientEmail ||
    params.recipient ||
    order.customerEmail ||
    (order.shippingAddressSnapshot as any)?.email ||
    'musteri@zuulab.com'

  const idempotencyKey =
    params.idempotencyKey || `${order.orderNumber}:${params.eventType}:EMAIL`

  // 1. Idempotency Check: Database & In-memory
  if (isDatabaseConfigured) {
    try {
      const dbNotification = await (db.orm.public.Notification as any).findFirst({
        where: {
          data: { path: ['idempotencyKey'], equals: idempotencyKey },
        },
      })
      if (dbNotification) {
        const existing: StoredNotification = {
          id: dbNotification.id,
          userId: dbNotification.userId,
          orderId: order.id,
          orderNumber: order.orderNumber,
          type: params.eventType,
          channel: 'EMAIL',
          status: dbNotification.isRead ? 'SENT' : 'PENDING',
          subject: dbNotification.title || '',
          recipient,
          htmlContent: dbNotification.body || '',
          textContent: dbNotification.body || '',
          provider: 'RESEND',
          idempotencyKey,
          retryCount: 0,
          createdAt: dbNotification.createdAt.toISOString(),
          updatedAt: dbNotification.createdAt.toISOString(),
        }

        await logAuditEvent({
          action: 'NOTIFICATION_DUPLICATE_SUPPRESSED',
          entity: 'Notification',
          entityId: existing.id,
          metadata: { orderNumber: order.orderNumber, eventType: params.eventType, source: 'DB' },
        })
        return existing
      }
    } catch (err) {
      console.warn('[notification.service] DB idempotency lookup error:', err)
    }
  }

  const existingInMemory = inMemoryNotifications.find(
    (n) => n.idempotencyKey === idempotencyKey
  )
  if (existingInMemory) {
    await logAuditEvent({
      action: 'NOTIFICATION_DUPLICATE_SUPPRESSED',
      entity: 'Notification',
      entityId: existingInMemory.id,
      metadata: { orderNumber: order.orderNumber, eventType: params.eventType },
    })
    return existingInMemory
  }

  // 2. Generate Template Content from Authoritative Server Data
  const templateResult = generateEmailTemplate(params.eventType, {
    orderNumber: order.orderNumber,
    customerName: order.shippingAddressSnapshot?.fullName || 'Değerli Müşterimiz',
    totalAmount: order.totalAmount,
    items: (order.items || []).map((i: any) => ({
      productName: i.productName,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      totalAmount: i.totalAmount,
    })),
    shippingAddress: order.shippingAddressSnapshot
      ? {
          fullName: order.shippingAddressSnapshot.fullName,
          addressLine: order.shippingAddressSnapshot.addressLine,
          city: order.shippingAddressSnapshot.city,
          district: order.shippingAddressSnapshot.district,
        }
      : undefined,
    carrier: (params.metadata?.carrier as string) || (params.templateData?.carrier as string) || 'Kargo',
    trackingNumber: (params.metadata?.trackingNumber as string) || (params.templateData?.trackingNumber as string),
    trackingUrl: (params.metadata?.trackingUrl as string) || (params.templateData?.trackingUrl as string),
    cancellationReason: (params.metadata?.cancellationReason as string) || (params.templateData?.cancellationReason as string),
    returnNumber: (params.metadata?.returnNumber as string) || (params.templateData?.returnNumber as string),
    returnReason: (params.metadata?.returnReason as string) || (params.templateData?.returnReason as string),
    refundAmount: (params.metadata?.refundAmount as number) || (params.templateData?.refundAmount as number),
    deliveryDate: new Date().toLocaleDateString('tr-TR'),
  })

  const now = new Date().toISOString()
  const notificationId = `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`

  const newNotification: StoredNotification = {
    id: notificationId,
    userId: order.userId,
    orderId: order.id,
    orderNumber: order.orderNumber,
    type: params.eventType,
    channel: 'EMAIL',
    status: 'PENDING',
    subject: templateResult.subject,
    recipient,
    htmlContent: templateResult.html,
    textContent: templateResult.text,
    provider: getEmailProvider().providerName,
    providerMessageId: null,
    idempotencyKey,
    scheduledAt: now,
    sentAt: null,
    failedAt: null,
    lastError: null,
    retryCount: 0,
    metadata: params.metadata || null,
    createdAt: now,
    updatedAt: now,
  }

  inMemoryNotifications.unshift(newNotification)

  // 3. Database Persistence if configured
  if (isDatabaseConfigured) {
    try {
      await db.orm.public.Notification.create({
        userId: order.userId,
        type: 'ORDER_UPDATE',
        title: templateResult.subject,
        body: templateResult.text,
        data: {
          idempotencyKey,
          eventType: params.eventType,
          orderNumber: order.orderNumber,
          recipient,
        },
      })
    } catch (err) {
      console.warn('[notification.service] DB notification write error:', err)
    }
  }

  await logAuditEvent({
    action: 'NOTIFICATION_CREATED',
    entity: 'Notification',
    entityId: newNotification.id,
    metadata: {
      orderNumber: order.orderNumber,
      eventType: params.eventType,
      recipient,
      channel: 'EMAIL',
    },
  })

  // 4. Dispatch Handling
  if (params.immediate === true) {
    return await dispatchNotification(newNotification.id)
  } else if (params.immediate !== false && params.asyncDispatch !== false) {
    // Fire-and-forget: does not block caller
    Promise.resolve().then(() => {
      dispatchNotification(newNotification.id).catch((err) => {
        console.error('[notification.service] Async dispatch error:', err)
      })
    })
  }

  return newNotification
}

/**
 * Dispatches a single notification through the active EmailProvider.
 * Concurrency protected.
 */
export async function dispatchNotification(
  notificationId: string
): Promise<StoredNotification> {
  if (inFlightDispatches.has(notificationId)) {
    return inFlightDispatches.get(notificationId)!
  }

  const dispatchPromise = executeDispatch(notificationId)
  inFlightDispatches.set(notificationId, dispatchPromise)

  try {
    return await dispatchPromise
  } finally {
    inFlightDispatches.delete(notificationId)
  }
}

async function executeDispatch(notificationId: string): Promise<StoredNotification> {
  const notification = inMemoryNotifications.find((n) => n.id === notificationId)
  if (!notification) {
    throw new Error(`Bildirim kaydı bulunamadı: ${notificationId}`)
  }

  if (notification.status === 'SENT' || notification.status === 'CANCELLED') {
    return notification
  }

  notification.status = 'PROCESSING'
  notification.updatedAt = new Date().toISOString()

  const provider = getEmailProvider(notification.provider)
  const result = await provider.sendEmail({
    to: notification.recipient,
    subject: notification.subject,
    html: notification.htmlContent,
    text: notification.textContent,
    idempotencyKey: notification.idempotencyKey,
  })

  const now = new Date().toISOString()
  notification.updatedAt = now

  if (result.success) {
    notification.status = 'SENT'
    notification.sentAt = now
    notification.providerMessageId = result.providerMessageId || null
    notification.lastError = null

    await logAuditEvent({
      action: 'NOTIFICATION_SENT',
      entity: 'Notification',
      entityId: notification.id,
      metadata: {
        orderNumber: notification.orderNumber,
        type: notification.type,
        recipient: notification.recipient,
        provider: provider.providerName,
        messageId: result.providerMessageId,
      },
    })
  } else {
    notification.status = 'FAILED'
    notification.failedAt = now
    notification.lastError = result.error || 'Gönderim başarısız oldu'
    notification.retryCount += 1

    await logAuditEvent({
      action: 'NOTIFICATION_FAILED',
      entity: 'Notification',
      entityId: notification.id,
      metadata: {
        orderNumber: notification.orderNumber,
        type: notification.type,
        recipient: notification.recipient,
        error: notification.lastError,
        retryCount: notification.retryCount,
      },
    })
  }

  return notification
}

/**
 * Triggers a manual or automatic retry for a failed notification
 */
export async function retryNotification(params: string | {
  notificationId: string
  requestedBy?: string
  force?: boolean
}): Promise<StoredNotification> {
  const notifId = typeof params === 'string' ? params : params.notificationId
  const force = typeof params === 'object' ? params.force : false
  const requestedBy = typeof params === 'object' ? params.requestedBy : undefined

  const notification = inMemoryNotifications.find((n) => n.id === notifId)
  if (!notification) {
    throw new Error('Yeniden denenecek bildirim bulunamadı.')
  }

  if (notification.status === 'SENT') {
    return notification
  }

  if (!force && notification.retryCount >= MAX_NOTIFICATION_RETRIES) {
    throw new Error(
      `Maksimum deneme sayısına (${MAX_NOTIFICATION_RETRIES}) ulaşıldı. Manuel yönetici onayı gereklidir.`
    )
  }

  await logAuditEvent({
    action: 'NOTIFICATION_RETRY_REQUESTED',
    entity: 'Notification',
    entityId: notification.id,
    metadata: {
      orderNumber: notification.orderNumber,
      retryCount: notification.retryCount,
      requestedBy: requestedBy,
    },
  })

  notification.status = 'PENDING'
  return dispatchNotification(notification.id)
}

/**
 * Gets a single notification by ID
 */
export async function getNotificationById(
  id: string
): Promise<StoredNotification | null> {
  return inMemoryNotifications.find((n) => n.id === id) || null
}

/**
 * Batch processor for Vercel Cron or admin dispatch
 */
export async function processPendingNotifications(): Promise<{
  processedCount: number
  successCount: number
  failedCount: number
  notifications: StoredNotification[]
}> {
  const eligible = inMemoryNotifications.filter(
    (n) =>
      n.status === 'PENDING' ||
      (n.status === 'FAILED' && n.retryCount < MAX_NOTIFICATION_RETRIES)
  )

  let successCount = 0
  let failedCount = 0

  for (const notif of eligible) {
    try {
      const res = await dispatchNotification(notif.id)
      if (res.status === 'SENT') {
        successCount++
      } else {
        failedCount++
      }
    } catch {
      failedCount++
    }
  }

  return {
    processedCount: eligible.length,
    successCount,
    failedCount,
    notifications: inMemoryNotifications,
  }
}

/**
 * Queries all notifications for an order
 */
export async function getNotificationsForOrder(
  orderNumber: string
): Promise<StoredNotification[]> {
  return inMemoryNotifications.filter((n) => n.orderNumber === orderNumber)
}

export const getNotificationsByOrder = getNotificationsForOrder

/**
 * Queries all notifications for admin dashboard with filters
 */
export async function getAllNotifications(filters?: {
  status?: NotificationStatus
  type?: NotificationEventType
  recipient?: string
  search?: string
}): Promise<StoredNotification[]> {
  let list = [...inMemoryNotifications]

  if (filters?.status) {
    list = list.filter((n) => n.status === filters.status)
  }
  if (filters?.type) {
    list = list.filter((n) => n.type === filters.type)
  }
  if (filters?.recipient) {
    list = list.filter((n) => n.recipient.toLowerCase().includes(filters.recipient!.toLowerCase()))
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase()
    list = list.filter(
      (n) =>
        (n.orderNumber && n.orderNumber.toLowerCase().includes(q)) ||
        n.recipient.toLowerCase().includes(q) ||
        n.subject.toLowerCase().includes(q)
    )
  }

  return list.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}
