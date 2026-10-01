import 'server-only'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { getPaymentProvider } from './provider.factory'
import type { PaymentProviderName, PaymentStatusName } from './payment.interface'
import { getOrderByNumber, updateOrderStatus } from '../orders.service'
import {
  commitInventoryReservation,
  releaseInventoryReservation,
  reserveInventory,
} from '../inventory.service'
import { logAuditEvent } from '../admin.service'
import { createNotification } from '../notification/notification.service'

export interface StoredPayment {
  id: string
  orderId: string
  orderNumber: string
  provider: PaymentProviderName
  providerRef?: string | null
  providerToken?: string | null
  status: PaymentStatusName
  amount: number
  currency: string
  attemptNumber: number
  expiresAt: string
  paidAt?: string | null
  failedAt?: string | null
  failureReason?: string | null
  rawResponse?: Record<string, unknown> | null
  ipAddress?: string | null
  createdAt: string
  updatedAt: string
}

const inMemoryPayments: StoredPayment[] = ((globalThis as any).__inMemoryPayments = (globalThis as any).__inMemoryPayments || [])

/**
 * Initiates payment session with the configured provider for an order.
 * Validates price integrity, prevents client-side price tampering, and registers expiration.
 */
export async function initiatePayment(params: {
  orderNumber: string
  customer: {
    fullName: string
    email: string
    phone: string
  }
  ipAddress?: string
  attemptNumber?: number
  clientExpectedTotal?: number
}) {
  const order = await getOrderByNumber(params.orderNumber, undefined, true)
  if (!order) {
    throw new Error('Ödeme başlatılacak sipariş bulunamadı.')
  }

  // Security check: Client-side total tampering detection
  if (params.clientExpectedTotal !== undefined) {
    const diff = Math.abs(params.clientExpectedTotal - order.totalAmount)
    if (diff > 0.05) {
      await logAuditEvent({
        action: 'PAYMENT_AMOUNT_TAMPER_ATTEMPT',
        entity: 'Order',
        entityId: order.orderNumber,
        metadata: {
          clientAmount: params.clientExpectedTotal,
          serverAmount: order.totalAmount,
        },
      })
      throw new Error(
        `SECURITY ALERT: Tutar uyuşmazlığı tespit edildi. İstemci: ${params.clientExpectedTotal} TL, Sunucu: ${order.totalAmount} TL`
      )
    }
  }

  const attemptNumber = params.attemptNumber || 1
  const provider = getPaymentProvider()

  // Generate provider session (PayTR / iyzico / Sandbox)
  const sessionResult = await provider.createSession({
    orderNumber: order.orderNumber,
    amount: order.totalAmount,
    currency: 'TRY',
    attemptNumber,
    customer: {
      ...params.customer,
      ip: params.ipAddress,
    },
    address: {
      addressLine: order.shippingAddressSnapshot.addressLine,
      city: order.shippingAddressSnapshot.city,
      district: order.shippingAddressSnapshot.district,
      postalCode: order.shippingAddressSnapshot.postalCode,
      country: order.shippingAddressSnapshot.country,
    },
    items: order.items.map((i: any) => ({
      name: i.productName,
      price: i.unitPrice,
      quantity: i.quantity,
    })),
    shippingAmount: order.shippingAmount,
    discountAmount: order.discountAmount,
    subtotal: order.subtotal,
  })

  const now = new Date().toISOString()
  const expiresAt =
    sessionResult.expiresAt || new Date(Date.now() + 30 * 60 * 1000).toISOString()

  const paymentRecord: StoredPayment = {
    id: sessionResult.paymentId,
    orderId: order.id,
    orderNumber: order.orderNumber,
    provider: sessionResult.provider,
    providerToken: sessionResult.sessionToken,
    status: 'PENDING',
    amount: order.totalAmount,
    currency: 'TRY',
    attemptNumber,
    expiresAt,
    ipAddress: params.ipAddress || null,
    createdAt: now,
    updatedAt: now,
  }

  // Persist to PostgreSQL if configured
  if (isDatabaseConfigured) {
    try {
      await db.orm.public.Payment.create({
        orderId: order.id,
        provider: sessionResult.provider as any,
        providerToken: sessionResult.sessionToken,
        status: 'PENDING',
        amount: order.totalAmount.toString() as any,
        currency: 'TRY',
        ipAddress: params.ipAddress || null,
      })
    } catch (err) {
      console.warn('[payment.service] DB payment create failed:', err)
    }
  }

  inMemoryPayments.unshift(paymentRecord)

  await logAuditEvent({
    action: 'PAYMENT_CREATED',
    entity: 'Payment',
    entityId: paymentRecord.id,
    metadata: {
      orderNumber: order.orderNumber,
      amount: order.totalAmount,
      provider: sessionResult.provider,
      attemptNumber,
    },
  })

  return {
    ...sessionResult,
    amount: order.totalAmount,
    orderNumber: order.orderNumber,
    attemptNumber,
    expiresAt,
  }
}

/**
 * Handles incoming payment provider webhook with strict signature verification,
 * amount integrity checks, and database-level / in-memory idempotency.
 */
export async function handlePaymentWebhook(
  payload: Record<string, unknown>,
  signature?: string
): Promise<{ success: boolean; message: string; orderNumber?: string; paymentId?: string }> {
  const provider = getPaymentProvider()

  // 1. Verify signature with active provider
  const verified = await provider.verifyWebhook(payload, signature)
  if (!verified.isValid) {
    await logAuditEvent({
      action: 'PAYMENT_WEBHOOK_REJECTED',
      entity: 'Payment',
      entityId: String(payload.paymentId || payload.merchant_oid || 'unknown'),
      metadata: { reason: 'INVALID_SIGNATURE', payload },
    })
    throw new Error('SECURITY VIOLATION: Geçersiz ödeme sağlayıcı imzası.')
  }

  const { paymentId, orderNumber, status, failureReason, transactionRef, amount, currency } =
    verified

  // 2. Find payment record (by paymentId or orderNumber)
  let payment = inMemoryPayments.find(
    (p) => p.id === paymentId || p.orderNumber === orderNumber
  )

  const order = await getOrderByNumber(orderNumber, undefined, true)
  if (!order) {
    throw new Error(`Sipariş bulunamadı: #${orderNumber}`)
  }

  if (!payment) {
    payment = {
      id: paymentId || `pay-${Date.now()}`,
      orderId: order.id,
      orderNumber: order.orderNumber,
      provider: provider.name,
      status: 'PENDING',
      amount: order.totalAmount,
      currency: 'TRY',
      attemptNumber: 1,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    inMemoryPayments.unshift(payment)
  }

  // 3. Amount & Currency integrity check
  if (amount > 0) {
    const amountDiff = Math.abs(amount - order.totalAmount)
    if (amountDiff > 0.1) {
      await logAuditEvent({
        action: 'PAYMENT_AMOUNT_MISMATCH',
        entity: 'Payment',
        entityId: payment.id,
        metadata: {
          webhookAmount: amount,
          orderAmount: order.totalAmount,
          orderNumber,
        },
      })
      throw new Error(
        `SECURITY VIOLATION: Webhook tutarı sipariş tutarı ile eşleşmiyor. (Webhook: ${amount}, Sipariş: ${order.totalAmount})`
      )
    }
  }

  if (currency && currency !== 'TRY' && currency !== 'TL') {
    throw new Error(`SECURITY VIOLATION: Beklenmeyen para birimi: ${currency}`)
  }

  // 4. IDEMPOTENCY CHECK: If payment is already SUCCEEDED, safely return OK without modifying anything
  if (payment.status === 'SUCCEEDED') {
    return {
      success: true,
      message: 'Ödeme zaten işlenmiş (Idempotent bypass).',
      orderNumber: payment.orderNumber,
      paymentId: payment.id,
    }
  }

  const now = new Date().toISOString()

  // 5. Handle Success vs Failure
  if (status === 'SUCCEEDED') {
    payment.status = 'SUCCEEDED'
    payment.paidAt = now
    payment.providerRef = transactionRef || null
    payment.updatedAt = now

    // Update order status through state machine: PAYMENT_PENDING -> CONFIRMED
    await updateOrderStatus(
      order.orderNumber,
      'CONFIRMED',
      `Ödeme onaylandı. Sağlayıcı: ${payment.provider}, Referans: ${transactionRef || 'N/A'}`
    )

    // Commit inventory permanently (deducts stock and releases reservation)
    await commitInventoryReservation(
      order.items.map((i: any) => ({ productId: i.productId, quantity: i.quantity })),
      order.orderNumber
    )

    // Update DB if configured
    if (isDatabaseConfigured) {
      try {
        await db.orm.public.Payment.where({ id: payment.id }).update({
          status: 'SUCCEEDED',
          paidAt: new Date(),
          providerRef: transactionRef || null,
        })
      } catch (err) {
        console.warn('[payment.service] DB payment update failed:', err)
      }
    }

    await logAuditEvent({
      action: 'PAYMENT_PAID',
      entity: 'Payment',
      entityId: payment.id,
      metadata: {
        orderNumber: order.orderNumber,
        amount: payment.amount,
        transactionRef,
        provider: payment.provider,
        attemptNumber: payment.attemptNumber,
      },
    })

    // Non-blocking payment notification
    createNotification({
      orderNumber: order.orderNumber,
      eventType: 'PAYMENT_SUCCEEDED',
      metadata: { amount: payment.amount, provider: payment.provider },
    }).catch((err) => {
      console.warn('[payment.service] Error sending PAYMENT_SUCCEEDED notification:', err)
    })

    return {
      success: true,
      message: 'Ödeme başarıyla tamamlandı.',
      orderNumber: order.orderNumber,
      paymentId: payment.id,
    }
  } else {
    // Payment failed
    payment.status = 'FAILED'
    payment.failedAt = now
    payment.failureReason = failureReason || 'Banka tarafından reddedildi.'
    payment.updatedAt = now

    // Update order status to PAYMENT_FAILED
    await updateOrderStatus(
      order.orderNumber,
      'PAYMENT_FAILED',
      `Ödeme başarısız: ${payment.failureReason}`
    )

    // Release inventory reservation back to available stock
    await releaseInventoryReservation(
      order.items.map((i: any) => ({ productId: i.productId, quantity: i.quantity })),
      order.orderNumber
    )

    // Update DB if configured
    if (isDatabaseConfigured) {
      try {
        await db.orm.public.Payment.where({ id: payment.id }).update({
          status: 'FAILED',
          failedAt: new Date(),
          failureReason: payment.failureReason,
        })
      } catch (err) {
        console.warn('[payment.service] DB payment update failed:', err)
      }
    }

    await logAuditEvent({
      action: 'PAYMENT_FAILED',
      entity: 'Payment',
      entityId: payment.id,
      metadata: {
        orderNumber: order.orderNumber,
        failureReason: payment.failureReason,
        attemptNumber: payment.attemptNumber,
      },
    })

    // Non-blocking payment failure notification
    createNotification({
      orderNumber: order.orderNumber,
      eventType: 'PAYMENT_FAILED',
      metadata: { failureReason: payment.failureReason },
    }).catch((err) => {
      console.warn('[payment.service] Error sending PAYMENT_FAILED notification:', err)
    })

    return {
      success: false,
      message: payment.failureReason || 'Ödeme reddedildi.',
      orderNumber: order.orderNumber,
      paymentId: payment.id,
    }
  }
}

/**
 * Retries payment for a failed order without creating a duplicate order.
 * Re-reserves stock, creates attempt #N, and generates a new payment session.
 */
export async function retryPayment(params: {
  orderNumber: string
  ipAddress?: string
}) {
  const order = await getOrderByNumber(params.orderNumber, undefined, true)
  if (!order) {
    throw new Error('Tekrar denenecek sipariş bulunamadı.')
  }

  // Only failed or pending orders can be retried
  if (order.status !== 'PAYMENT_FAILED' && order.status !== 'PAYMENT_PENDING') {
    throw new Error(
      `Bu sipariş için ödeme tekrar denenemez. Mevcut durum: ${order.status}`
    )
  }

  // 1. Re-reserve inventory
  const reservationResult = await reserveInventory(
    order.items.map((i: any) => ({ productId: i.productId, quantity: i.quantity })),
    order.orderNumber
  )
  if (!reservationResult.success) {
    throw new Error(reservationResult.error || 'Stok rezervasyonu yenilenemedi.')
  }

  // 2. Count existing payment attempts
  const existingAttempts = inMemoryPayments.filter((p) => p.orderNumber === order.orderNumber)
  const nextAttemptNumber = existingAttempts.length + 1

  // 3. Move order state back to PAYMENT_PENDING if it was PAYMENT_FAILED
  if (order.status === 'PAYMENT_FAILED') {
    await updateOrderStatus(
      order.orderNumber,
      'PAYMENT_PENDING',
      `Müşteri ödemeyi tekrar deniyor (Deneme #${nextAttemptNumber})`
    )
  }

  // 4. Initiate payment with the new attempt number
  const sessionResult = await initiatePayment({
    orderNumber: order.orderNumber,
    customer: {
      fullName: order.shippingAddressSnapshot.fullName,
      email: order.customerEmail || 'musteri@zuulab.com',
      phone: order.shippingAddressSnapshot.phone,
    },
    ipAddress: params.ipAddress,
    attemptNumber: nextAttemptNumber,
    clientExpectedTotal: order.totalAmount,
  })

  await logAuditEvent({
    action: 'PAYMENT_RETRY_INITIATED',
    entity: 'Order',
    entityId: order.orderNumber,
    metadata: {
      attemptNumber: nextAttemptNumber,
      orderNumber: order.orderNumber,
      amount: order.totalAmount,
    },
  })

  return sessionResult
}

/**
 * Cleanup expired reservations (timeout after 30 minutes of inactivity).
 * Designed for serverless cron or lazy execution.
 */
export async function cleanupExpiredReservations(): Promise<{
  cleanedCount: number
  expiredOrders: string[]
}> {
  const now = new Date().getTime()
  const expiredPayments = inMemoryPayments.filter(
    (p) => p.status === 'PENDING' && new Date(p.expiresAt).getTime() < now
  )

  const expiredOrders: string[] = []

  for (const payment of expiredPayments) {
    const order = await getOrderByNumber(payment.orderNumber, undefined, true)
    if (order && order.status === 'PAYMENT_PENDING') {
      payment.status = 'CANCELLED'
      payment.failureReason = 'Ödeme oturum süresi doldu (Timeout).'
      payment.updatedAt = new Date().toISOString()

      // Release inventory reservation
      await releaseInventoryReservation(
        order.items.map((i: any) => ({ productId: i.productId, quantity: i.quantity })),
        order.orderNumber
      )

      // Transition order to CANCELLED
      await updateOrderStatus(
        order.orderNumber,
        'CANCELLED',
        'Ödeme süresi dolduğu için rezervasyon serbest bırakıldı.'
      )

      await logAuditEvent({
        action: 'INVENTORY_TIMEOUT_CLEANUP',
        entity: 'Order',
        entityId: order.orderNumber,
        metadata: {
          paymentId: payment.id,
          expiredAt: payment.expiresAt,
        },
      })

      expiredOrders.push(order.orderNumber)
    }
  }

  return {
    cleanedCount: expiredOrders.length,
    expiredOrders,
  }
}

/**
 * Triggers test/sandbox payment confirmation or rejection for development and testing.
 */
export async function processTestPayment(params: {
  orderNumber: string
  paymentId?: string
  simulateStatus: 'SUCCESS' | 'FAILED'
  failureReason?: string
  attemptNumber?: number
}) {
  const order = await getOrderByNumber(params.orderNumber, undefined, true)
  if (!order) {
    throw new Error('Sipariş bulunamadı.')
  }

  const paymentId =
    params.paymentId ||
    inMemoryPayments.find((p) => p.orderNumber === order.orderNumber)?.id ||
    `pay_test_${Date.now()}`

  const provider = getPaymentProvider()

  if ('generateTestWebhook' in provider && typeof (provider as any).generateTestWebhook === 'function') {
    const { payload, signature } = (provider as any).generateTestWebhook(
      order.orderNumber,
      paymentId,
      order.totalAmount,
      params.simulateStatus,
      params.failureReason,
      params.attemptNumber || 1
    )
    return handlePaymentWebhook(payload, signature)
  }

  // Fallback payload
  const payload = {
    paymentId,
    orderNumber: order.orderNumber,
    amount: order.totalAmount,
    status: params.simulateStatus === 'SUCCESS' ? 'SUCCEEDED' : 'FAILED',
    failureReason: params.failureReason,
    transactionRef: `TRX-${Date.now()}`,
  }

  return handlePaymentWebhook(payload, 'test-signature')
}

/**
 * Retrieves all payments for the admin view with optional filtering.
 */
export async function getAllPayments(filters?: {
  status?: string
  provider?: string
  search?: string
  limit?: number
}): Promise<StoredPayment[]> {
  let list = [...inMemoryPayments]

  if (filters?.status && filters.status !== 'ALL') {
    list = list.filter((p) => p.status === filters.status)
  }

  if (filters?.provider && filters.provider !== 'ALL') {
    list = list.filter((p) => p.provider === filters.provider)
  }

  if (filters?.search) {
    const q = filters.search.toLowerCase()
    list = list.filter(
      (p) =>
        p.id.toLowerCase().includes(q) ||
        p.orderNumber.toLowerCase().includes(q) ||
        (p.providerRef && p.providerRef.toLowerCase().includes(q))
    )
  }

  if (filters?.limit) {
    list = list.slice(0, filters.limit)
  }

  return list
}
