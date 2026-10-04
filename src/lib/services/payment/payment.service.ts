import 'server-only'
import { or } from '@prisma/orm-postgres/orm-client'
import { db } from '@/prisma/db'
import { round2 } from '@/lib/pricing/money'
import { dbNumeric } from '@/lib/db/numeric'
import { dbTimestampToIso, toDbTimestamp } from '@/lib/db/time'
import { getPaymentProvider } from './provider.factory'
import { getPublicOrigin } from '@/lib/config/app-url'
import { buildMerchantOid, PayTRPaymentProvider } from './paytr.provider'
import type { PaymentProviderName, PaymentStatusName } from './payment.interface'
import {
  BANK_TRANSFER_HOLD_HOURS,
  PAYMENT_HOLD_MINUTES,
  findOrderByNumber,
  paymentMethodOf,
  markOrderPaid,
  updateOrderStatus,
  type StoredOrder,
} from '../orders.service'
import { commitOrderStock, reacquireOrderStock, InsufficientStockError } from '../checkout/stock.service'
import { recordCouponUsage } from '../coupons.service'
import { sendNewOrderAlert } from '../notification/store-order-email'
import { logAuditEvent } from '../admin.service'
import { createNotification } from '../notification/notification.service'

export interface StoredPayment {
  id: string
  orderId: string
  orderNumber: string
  provider: PaymentProviderName
  providerRef?: string | null
  providerToken?: string | null
  merchantOid?: string | null
  status: PaymentStatusName
  amount: number
  paidAmount?: number | null
  installmentCount?: number | null
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

/** Payment session lifetime; PayTR's iframe uses the same 30 minute timeout. */
const PAYMENT_SESSION_MINUTES = 30

function paymentQuery() {
  return db.orm.public.Payment.include('order', (o) => o.select('id', 'orderNumber'))
}

type PaymentRow = NonNullable<Awaited<ReturnType<ReturnType<typeof paymentQuery>['first']>>>

function toStoredPayment(row: PaymentRow): StoredPayment {
  return {
    id: row.id,
    orderId: row.orderId,
    orderNumber: row.order?.orderNumber ?? '',
    provider: row.provider as PaymentProviderName,
    providerRef: row.providerRef ?? null,
    providerToken: row.providerToken ?? null,
    merchantOid: row.merchantOid ?? null,
    status: row.status as PaymentStatusName,
    amount: Number(row.amount),
    paidAmount: row.paidAmount !== null && row.paidAmount !== undefined ? Number(row.paidAmount) : null,
    installmentCount: row.installmentCount ?? null,
    currency: row.currency,
    attemptNumber: row.attemptNumber,
    expiresAt: dbTimestampToIso(row.expiresAt) ?? '',
    paidAt: dbTimestampToIso(row.paidAt),
    failedAt: dbTimestampToIso(row.failedAt),
    failureReason: row.failureReason ?? null,
    rawResponse: (row.rawResponse ?? null) as Record<string, unknown> | null,
    ipAddress: row.ipAddress ?? null,
    createdAt: dbTimestampToIso(row.createdAt) ?? '',
    updatedAt: dbTimestampToIso(row.updatedAt) ?? '',
  }
}

/** Compare-and-set on payment status; true only for the caller whose update applied. */
async function transitionPayment(
  paymentId: string,
  from: PaymentStatusName[],
  to: PaymentStatusName
): Promise<boolean> {
  for (const state of from) {
    const plan = db.raw.sql`UPDATE payments SET status = ${to}::"PaymentStatus", updated_at = now() WHERE id = ${paymentId} AND status = ${state}::"PaymentStatus"`.affectedCount().build()
    const { affectedRows } = await db.runtime().execute(plan)
    if (affectedRows === 1) return true
  }
  return false
}

/**
 * Opens a provider payment session for an order awaiting payment and records the
 * attempt (with its merchant_oid) so the callback can be matched on any instance.
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
  /** Origin the customer is on; PayTR sends the browser back there after payment. */
  returnOrigin?: string
}) {
  const order = await findOrderByNumber(params.orderNumber)
  if (!order) {
    throw new Error('Ödeme başlatılacak sipariş bulunamadı.')
  }
  if (order.status !== 'PAYMENT_PENDING') {
    throw new Error(`Bu sipariş için ödeme başlatılamaz. Mevcut durum: ${order.status}`)
  }

  if (params.clientExpectedTotal !== undefined && Math.abs(params.clientExpectedTotal - order.totalAmount) > 0.009) {
    await logAuditEvent({
      action: 'PAYMENT_AMOUNT_TAMPER_ATTEMPT',
      entity: 'Order',
      entityId: order.orderNumber,
      metadata: { clientAmount: params.clientExpectedTotal, serverAmount: order.totalAmount },
    })
    throw new Error('Sepet tutarı güncellendi. Lütfen yeni tutarı kontrol edip tekrar deneyin.')
  }

  // The customer switched from havale/EFT to card: the transfer is no longer expected
  const openTransfers = await db.orm.public.Payment.where({ orderId: order.id, provider: 'MANUAL', status: 'PENDING' }).all()
  for (const p of openTransfers) {
    await transitionPayment(p.id, ['PENDING'], 'CANCELLED')
  }

  const previousAttempts = await db.orm.public.Payment
    .where({ orderId: order.id })
    .aggregate((a) => ({ n: a.count() }))
  const attemptNumber = Math.max(params.attemptNumber ?? 1, previousAttempts.n + 1)
  const merchantOid = buildMerchantOid(order.orderNumber, attemptNumber)
  const provider = getPaymentProvider()

  const returnBase = params.returnOrigin || getPublicOrigin()
  const orderParam = encodeURIComponent(order.orderNumber)
  const sessionResult = await provider.createSession({
    orderNumber: order.orderNumber,
    merchantOid,
    merchantOkUrl: `${returnBase}/odeme/basarili?order=${orderParam}`,
    merchantFailUrl: `${returnBase}/odeme/basarisiz?order=${orderParam}`,
    amount: order.totalAmount,
    currency: 'TRY',
    attemptNumber,
    customer: { ...params.customer, ip: params.ipAddress },
    address: {
      addressLine: order.shippingAddressSnapshot.addressLine,
      city: order.shippingAddressSnapshot.city,
      district: order.shippingAddressSnapshot.district,
      postalCode: order.shippingAddressSnapshot.postalCode,
      country: order.shippingAddressSnapshot.country,
    },
    items: order.items.map((i) => ({ name: i.productName, price: i.unitPrice, quantity: i.quantity })),
    shippingAmount: order.shippingAmount,
    discountAmount: order.discountAmount,
    subtotal: order.subtotal,
  })

  const expiresAt = new Date(Date.now() + PAYMENT_SESSION_MINUTES * 60 * 1000)
  const created = await db.orm.public.Payment.create({
    orderId: order.id,
    provider: 'PAYTR',
    providerToken: sessionResult.sessionToken,
    merchantOid,
    attemptNumber,
    status: 'PENDING',
    amount: dbNumeric(order.totalAmount),
    currency: 'TRY',
    ipAddress: params.ipAddress || null,
    expiresAt: toDbTimestamp(expiresAt) as never,
  })

  await logAuditEvent({
    action: 'PAYMENT_CREATED',
    entity: 'Payment',
    entityId: created.id,
    metadata: { orderNumber: order.orderNumber, amount: order.totalAmount, merchantOid, attemptNumber },
  })

  return {
    ...sessionResult,
    paymentId: created.id,
    amount: order.totalAmount,
    orderNumber: order.orderNumber,
    attemptNumber,
    expiresAt: expiresAt.toISOString(),
  }
}

/**
 * Havale/EFT: records a pending MANUAL payment for an order awaiting payment, keeps
 * the stock for BANK_TRANSFER_HOLD_HOURS and mails the customer the bank details
 * (the shop gets a heads-up too). No provider is involved; the money is matched by
 * hand and confirmed with confirmBankTransfer. Calling it again for the same order
 * returns the open transfer instead of starting a new one. A card session still open
 * for the order (the customer switched method) is closed.
 */
export async function initiateBankTransfer(params: { orderNumber: string; ipAddress?: string }) {
  const order = await findOrderByNumber(params.orderNumber)
  if (!order) throw new Error('Ödeme başlatılacak sipariş bulunamadı.')
  if (order.status !== 'PAYMENT_PENDING') {
    throw new Error(`Bu sipariş için havale başlatılamaz. Mevcut durum: ${order.status}`)
  }

  const attempts = await db.orm.public.Payment
    .where({ orderId: order.id })
    .orderBy((p) => p.attemptNumber.desc())
    .all()
  const open = attempts.find((p) => paymentMethodOf(p) === 'BANK_TRANSFER' && p.status === 'PENDING')
  if (open) {
    return { paymentId: open.id, orderNumber: order.orderNumber, amount: order.totalAmount, expiresAt: order.paymentExpiresAt }
  }

  for (const p of attempts) {
    if (p.status === 'PENDING') await transitionPayment(p.id, ['PENDING'], 'CANCELLED')
  }

  const expiresAt = new Date(Date.now() + BANK_TRANSFER_HOLD_HOURS * 3600_000)
  await db.orm.public.Order.where({ id: order.id }).update({ paymentExpiresAt: toDbTimestamp(expiresAt) as never })
  const created = await db.orm.public.Payment.create({
    orderId: order.id,
    provider: 'MANUAL',
    attemptNumber: (attempts[0]?.attemptNumber ?? 0) + 1,
    status: 'PENDING',
    amount: dbNumeric(order.totalAmount),
    currency: 'TRY',
    ipAddress: params.ipAddress || null,
    expiresAt: toDbTimestamp(expiresAt) as never,
  })

  await logAuditEvent({
    action: 'PAYMENT_CREATED',
    entity: 'Payment',
    entityId: created.id,
    metadata: { orderNumber: order.orderNumber, amount: order.totalAmount, method: 'BANK_TRANSFER' },
  })

  const paymentDeadline = expiresAt.toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
  createNotification({
    orderNumber: order.orderNumber,
    eventType: 'BANK_TRANSFER_AWAITING',
    metadata: { paymentDeadline },
  }).catch((err) => console.warn('[payment.service] BANK_TRANSFER_AWAITING notification failed:', err))
  await sendNewOrderAlert(order.id, 'bank-transfer')

  return { paymentId: created.id, orderNumber: order.orderNumber, amount: order.totalAmount, expiresAt: expiresAt.toISOString() }
}

/**
 * The shop saw the havale/EFT arrive: confirms the order through the same path as a
 * card payment (stock committed, coupon used, order CONFIRMED, customer and shop
 * mails). Also works after the 48 hours lapsed: the stock is taken again, and an
 * oversell is flagged as with a late card payment.
 */
export async function confirmBankTransfer(params: { orderNumber: string; confirmedBy: string }) {
  const order = await findOrderByNumber(params.orderNumber)
  if (!order) throw new Error('Sipariş bulunamadı.')
  if (order.paidAt || !['PAYMENT_PENDING', 'PAYMENT_FAILED'].includes(order.status)) {
    throw new Error('Bu siparişin ödemesi zaten alınmış ya da sipariş kapanmış.')
  }
  const row = await paymentQuery()
    .where({ orderId: order.id, provider: 'MANUAL' })
    .orderBy((p) => p.attemptNumber.desc())
    .first()
  if (!row || paymentMethodOf(row) !== 'BANK_TRANSFER' || !['PENDING', 'CANCELLED'].includes(row.status)) {
    throw new Error('Bu sipariş havale/EFT ile verilmemiş.')
  }

  const result = await handleSuccess(toStoredPayment(row), order, {
    amount: order.totalAmount,
    transactionRef: `havale:${params.confirmedBy}`,
    rawPayload: { method: 'BANK_TRANSFER', confirmedBy: params.confirmedBy },
  })
  await logAuditEvent({
    action: 'BANK_TRANSFER_CONFIRMED',
    entity: 'Order',
    entityId: order.orderNumber,
    metadata: { confirmedBy: params.confirmedBy, amount: order.totalAmount },
  })
  return result
}

/**
 * Kapıda ödeme (cash on delivery, PTT Kargo via Geliver): nothing is paid now, so the
 * order is confirmed straight away: stock committed, coupon used, a pending MANUAL
 * payment marked { method: 'CASH_ON_DELIVERY' }, confirmation mail to the customer and
 * a heads-up to the shop. The money is marked collected when Geliver reports the
 * parcel delivered (markCashOnDeliveryCollected).
 */
export async function initiateCashOnDelivery(params: { orderNumber: string; ipAddress?: string }) {
  const order = await findOrderByNumber(params.orderNumber)
  if (!order) throw new Error('Sipariş bulunamadı.')
  const attempts = await db.orm.public.Payment.where({ orderId: order.id }).orderBy((p) => p.attemptNumber.desc()).all()
  // A resubmitted checkout returns the order already confirmed
  if (attempts.some((p) => paymentMethodOf(p) === 'CASH_ON_DELIVERY') && order.status !== 'PAYMENT_PENDING') {
    return { orderNumber: order.orderNumber, amount: order.totalAmount }
  }
  if (order.status !== 'PAYMENT_PENDING') {
    throw new Error(`Bu sipariş için kapıda ödeme seçilemez. Mevcut durum: ${order.status}`)
  }

  for (const p of attempts) {
    if (p.status === 'PENDING') await transitionPayment(p.id, ['PENDING'], 'CANCELLED')
  }
  const created = await db.orm.public.Payment.create({
    orderId: order.id,
    provider: 'MANUAL',
    attemptNumber: (attempts[0]?.attemptNumber ?? 0) + 1,
    status: 'PENDING',
    amount: dbNumeric(order.totalAmount),
    currency: 'TRY',
    ipAddress: params.ipAddress || null,
    rawResponse: { method: 'CASH_ON_DELIVERY', carrier: 'PTT Kargo (Geliver)' } as never,
  })

  const stock = await commitOrderStock(order.id)
  await recordCouponUsage(order.id)
  await db.orm.public.Order.where({ id: order.id }).update({ paymentExpiresAt: null as never })
  const moved = await updateOrderStatus(order.orderNumber, 'CONFIRMED', 'Kapıda ödemeli sipariş (PTT Kargo); ödeme teslimatta alınacak.', 'customer')
  if (!moved.success) console.error(`[payment.service] ${order.orderNumber} kapıda ödeme could not be confirmed: ${moved.error}`)

  await logAuditEvent({
    action: 'PAYMENT_CREATED',
    entity: 'Payment',
    entityId: created.id,
    metadata: { orderNumber: order.orderNumber, amount: order.totalAmount, method: 'CASH_ON_DELIVERY', oversold: stock.oversold },
  })
  await sendNewOrderAlert(order.id, 'cash-on-delivery')
  return { orderNumber: order.orderNumber, amount: order.totalAmount }
}

/** PTT delivered a kapıda ödeme parcel and collected the money: the payment is complete */
export async function markCashOnDeliveryCollected(orderNumber: string, collectedAt: Date) {
  const order = await findOrderByNumber(orderNumber)
  if (!order || order.paidAt) return
  const row = await db.orm.public.Payment
    .where({ orderId: order.id, provider: 'MANUAL' })
    .orderBy((p) => p.attemptNumber.desc())
    .first()
  if (!row || paymentMethodOf(row) !== 'CASH_ON_DELIVERY') return
  if (!(await transitionPayment(row.id, ['PENDING', 'PROCESSING'], 'SUCCEEDED'))) return
  await db.orm.public.Payment.where({ id: row.id }).update({
    paidAt: toDbTimestamp(collectedAt) as never,
    paidAmount: dbNumeric(order.totalAmount),
    providerRef: 'kapida-odeme:ptt',
  })
  await markOrderPaid(order.id, collectedAt)
  await logAuditEvent({
    action: 'PAYMENT_PAID',
    entity: 'Payment',
    entityId: row.id,
    metadata: { orderNumber, amount: order.totalAmount, method: 'CASH_ON_DELIVERY' },
  })
}

/**
 * Handles a provider callback.
 *
 * Throws only for an invalid signature (403) or a transient error, where the
 * provider should retry. Everything else, including duplicates and anomalies we
 * must investigate by hand, is acknowledged so the provider stops resending.
 */
export async function handlePaymentWebhook(
  payload: Record<string, unknown>,
  signature?: string
): Promise<{ success: boolean; message: string; orderNumber?: string; paymentId?: string }> {
  const provider = getPaymentProvider()

  const verified = await provider.verifyWebhook(payload, signature)
  if (!verified.isValid) {
    await logAuditEvent({
      action: 'PAYMENT_WEBHOOK_REJECTED',
      entity: 'Payment',
      entityId: String(payload.merchant_oid || payload.paymentId || 'unknown'),
      metadata: { reason: 'INVALID_SIGNATURE' },
    })
    throw new Error('SECURITY VIOLATION: Geçersiz ödeme sağlayıcı imzası.')
  }

  const merchantOid = verified.merchantOid || ''
  const row = merchantOid ? await paymentQuery().where({ merchantOid }).first() : null

  if (!row) {
    await logAuditEvent({
      action: 'PAYMENT_WEBHOOK_UNMATCHED',
      entity: 'Payment',
      entityId: merchantOid || 'unknown',
      metadata: { status: verified.status, amount: verified.amount },
    })
    return { success: false, message: 'Eşleşen ödeme kaydı bulunamadı; kayıt altına alındı.' }
  }

  const payment = toStoredPayment(row)
  const order = await findOrderByNumber(payment.orderNumber)
  if (!order) {
    throw new Error(`Sipariş bulunamadı: ${payment.orderNumber}`)
  }

  if (verified.currency && verified.currency !== 'TRY' && verified.currency !== 'TL') {
    await logAuditEvent({
      action: 'PAYMENT_CURRENCY_MISMATCH',
      entity: 'Payment',
      entityId: payment.id,
      metadata: { currency: verified.currency, orderNumber: order.orderNumber },
    })
    return { success: false, message: 'Beklenmeyen para birimi; manuel inceleme gerekiyor.', orderNumber: order.orderNumber }
  }

  if (verified.status === 'SUCCEEDED') {
    return handleSuccess(payment, order, verified)
  }
  return handleFailure(payment, order, verified.failureReason)
}

async function handleSuccess(
  payment: StoredPayment,
  order: StoredOrder,
  verified: { amount: number; installmentCount?: number; transactionRef?: string; rawPayload: Record<string, unknown> }
) {
  // With installments PayTR's total_amount includes the interest, so it may exceed
  // the order total; it must never be lower.
  if (verified.amount > 0 && round2(verified.amount) + 0.009 < order.totalAmount) {
    await logAuditEvent({
      action: 'PAYMENT_AMOUNT_MISMATCH',
      entity: 'Payment',
      entityId: payment.id,
      metadata: { paid: verified.amount, orderTotal: order.totalAmount, orderNumber: order.orderNumber },
    })
    return {
      success: false,
      message: 'Ödenen tutar sipariş tutarından düşük; manuel inceleme gerekiyor.',
      orderNumber: order.orderNumber,
      paymentId: payment.id,
    }
  }

  const won = await transitionPayment(payment.id, ['PENDING', 'PROCESSING', 'CANCELLED'], 'SUCCEEDED')
  if (!won) {
    return { success: true, message: 'Ödeme zaten işlenmiş.', orderNumber: order.orderNumber, paymentId: payment.id }
  }

  const paidAt = new Date()
  await db.orm.public.Payment.where({ id: payment.id }).update({
    paidAt: toDbTimestamp(paidAt) as never,
    providerRef: verified.transactionRef || null,
    paidAmount: dbNumeric(verified.amount || order.totalAmount),
    installmentCount: verified.installmentCount ?? null,
    rawResponse: sanitizeRaw(verified.rawPayload) as never,
  })

  const alreadyPaid = order.paidAt !== null || !['PAYMENT_PENDING', 'PAYMENT_FAILED'].includes(order.status)
  if (alreadyPaid) {
    // A second attempt for an order that is already paid: money was taken twice.
    await logAuditEvent({
      action: 'PAYMENT_DUPLICATE_CAPTURE',
      entity: 'Payment',
      entityId: payment.id,
      metadata: { orderNumber: order.orderNumber, amount: verified.amount, note: 'İade gerekiyor.' },
    })
    return {
      success: true,
      message: 'Sipariş zaten ödenmiş; mükerrer ödeme iade için işaretlendi.',
      orderNumber: order.orderNumber,
      paymentId: payment.id,
    }
  }

  const stock = await commitOrderStock(order.id)
  await markOrderPaid(order.id, paidAt)
  await recordCouponUsage(order.id)

  const transition = await updateOrderStatus(
    order.orderNumber,
    'CONFIRMED',
    `Ödeme onaylandı. Referans: ${verified.transactionRef || payment.merchantOid}` +
      (verified.installmentCount && verified.installmentCount > 1 ? ` (${verified.installmentCount} taksit)` : ''),
    'payment-webhook'
  )
  if (!transition.success) {
    console.error(`[payment.service] ${order.orderNumber} paid but could not be confirmed: ${transition.error}`)
  }

  // "Sipariş Geldi!" mail to the shop; runs once per order (only the winning callback gets here)
  await sendNewOrderAlert(order.id)

  if (stock.oversold) {
    await logAuditEvent({
      action: 'ORDER_OVERSOLD',
      entity: 'Order',
      entityId: order.orderNumber,
      metadata: { note: 'Ödeme süresi dolduktan sonra onaylandı; stok yetersizdi, stok eksiye düştü.' },
    })
  }

  await logAuditEvent({
    action: 'PAYMENT_PAID',
    entity: 'Payment',
    entityId: payment.id,
    metadata: {
      orderNumber: order.orderNumber,
      amount: verified.amount,
      installmentCount: verified.installmentCount,
      attemptNumber: payment.attemptNumber,
    },
  })

  createNotification({
    orderNumber: order.orderNumber,
    eventType: 'PAYMENT_SUCCEEDED',
    metadata: { amount: verified.amount, provider: payment.provider },
  }).catch((err) => console.warn('[payment.service] PAYMENT_SUCCEEDED notification failed:', err))

  return { success: true, message: 'Ödeme başarıyla tamamlandı.', orderNumber: order.orderNumber, paymentId: payment.id }
}

async function handleFailure(payment: StoredPayment, order: StoredOrder, failureReason?: string) {
  const reason = failureReason || 'Banka tarafından reddedildi.'
  const won = await transitionPayment(payment.id, ['PENDING', 'PROCESSING'], 'FAILED')
  if (!won) {
    return { success: true, message: 'Ödeme sonucu zaten işlenmiş.', orderNumber: order.orderNumber, paymentId: payment.id }
  }

  await db.orm.public.Payment.where({ id: payment.id }).update({
    failedAt: toDbTimestamp() as never,
    failureReason: reason,
  })

  // Only the latest attempt decides the order; an old attempt failing late must not
  // undo a newer one that is still open or already paid.
  const latest = await db.orm.public.Payment
    .where({ orderId: order.id })
    .orderBy((p) => p.attemptNumber.desc())
    .first()
  if (latest?.id === payment.id && order.status === 'PAYMENT_PENDING') {
    await updateOrderStatus(order.orderNumber, 'PAYMENT_FAILED', `Ödeme başarısız: ${reason}`, 'payment-webhook')
  }

  await logAuditEvent({
    action: 'PAYMENT_FAILED',
    entity: 'Payment',
    entityId: payment.id,
    metadata: { orderNumber: order.orderNumber, failureReason: reason, attemptNumber: payment.attemptNumber },
  })

  createNotification({
    orderNumber: order.orderNumber,
    eventType: 'PAYMENT_FAILED',
    metadata: { failureReason: reason },
  }).catch((err) => console.warn('[payment.service] PAYMENT_FAILED notification failed:', err))

  return { success: false, message: reason, orderNumber: order.orderNumber, paymentId: payment.id }
}

const lastReconcileAt = new Map<string, number>()

/**
 * Asks PayTR whether an unpaid order was in fact paid, for when its notification
 * never arrived (wrong notification URL, outage, redirect). A confirmed payment goes
 * through the same success path as a callback, so it is idempotent with one.
 * Throttled per order per instance, since the payment page polls.
 */
export async function reconcileOrderPayment(
  orderNumber: string,
  options: { minIntervalMs?: number } = {}
): Promise<{ reconciled: boolean }> {
  const order = await findOrderByNumber(orderNumber)
  if (!order || !['PAYMENT_PENDING', 'PAYMENT_FAILED'].includes(order.status)) return { reconciled: false }

  const minInterval = options.minIntervalMs ?? 15_000
  const last = lastReconcileAt.get(order.id) ?? 0
  if (Date.now() - last < minInterval) return { reconciled: false }
  lastReconcileAt.set(order.id, Date.now())

  const provider = getPaymentProvider()
  if (!(provider instanceof PayTRPaymentProvider)) return { reconciled: false }

  const attempts = await paymentQuery()
    .where({ orderId: order.id })
    .orderBy((p) => p.attemptNumber.desc())
    .limit(3)
    .all()

  for (const row of attempts) {
    if (!row.merchantOid || !['PENDING', 'CANCELLED', 'PROCESSING'].includes(row.status)) continue
    const result = await provider.queryPaymentStatus(row.merchantOid)
    if (result.state !== 'PAID') continue

    await logAuditEvent({
      action: 'PAYMENT_RECONCILED',
      entity: 'Payment',
      entityId: row.id,
      metadata: { orderNumber, merchantOid: row.merchantOid, paymentTotal: result.paymentTotal },
    })
    await handleSuccess(toStoredPayment(row), order, {
      amount: result.paymentTotal,
      installmentCount: result.installmentCount,
      transactionRef: `status-query:${row.merchantOid}`,
      rawPayload: result.raw,
    })
    return { reconciled: true }
  }
  return { reconciled: false }
}

/** Keeps the provider payload for support, minus the signature. */
function sanitizeRaw(raw: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...raw }
  delete rest.hash
  return rest
}

/**
 * Retries payment for an order whose payment failed or is still pending, without
 * creating a new order. Stock released by the failure is taken again first.
 */
export async function retryPayment(params: {
  orderNumber: string
  ipAddress?: string
  returnOrigin?: string
}) {
  const order = await findOrderByNumber(params.orderNumber)
  if (!order) {
    throw new Error('Tekrar denenecek sipariş bulunamadı.')
  }
  if (order.status !== 'PAYMENT_FAILED' && order.status !== 'PAYMENT_PENDING') {
    throw new Error(`Bu sipariş için ödeme tekrar denenemez. Mevcut durum: ${order.status}`)
  }

  try {
    await reacquireOrderStock(order.id)
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      throw new Error(`${err.message} Siparişiniz için ödeme yeniden başlatılamıyor.`)
    }
    throw err
  }

  // Close any session still open for this order so only the new one can succeed.
  const open = await db.orm.public.Payment.where({ orderId: order.id, status: 'PENDING' }).all()
  for (const p of open) {
    await transitionPayment(p.id, ['PENDING'], 'CANCELLED')
  }

  if (order.status === 'PAYMENT_FAILED') {
    const moved = await updateOrderStatus(order.orderNumber, 'PAYMENT_PENDING', 'Müşteri ödemeyi tekrar deniyor.', 'customer')
    if (!moved.success) throw new Error(moved.error || 'Sipariş durumu güncellenemedi.')
  }
  await db.orm.public.Order.where({ id: order.id }).update({
    paymentExpiresAt: toDbTimestamp(new Date(Date.now() + PAYMENT_HOLD_MINUTES * 60 * 1000)) as never,
  })

  const sessionResult = await initiatePayment({
    orderNumber: order.orderNumber,
    customer: {
      fullName: order.shippingAddressSnapshot.fullName,
      email: order.customerEmail || '',
      phone: order.shippingAddressSnapshot.phone,
    },
    ipAddress: params.ipAddress,
    returnOrigin: params.returnOrigin,
  })

  await logAuditEvent({
    action: 'PAYMENT_RETRY_INITIATED',
    entity: 'Order',
    entityId: order.orderNumber,
    metadata: { attemptNumber: sessionResult.attemptNumber, amount: order.totalAmount },
  })

  return sessionResult
}

/**
 * Expires unpaid orders whose payment window has passed: their open payment
 * sessions are cancelled, the order moves to PAYMENT_FAILED (the customer can still
 * retry, and a late PayTR success can still confirm it) and the stock is released.
 */
export async function cleanupExpiredReservations(limit = 100): Promise<{
  cleanedCount: number
  expiredOrders: string[]
}> {
  const now = toDbTimestamp()
  const expired = await db.orm.public.Order
    .select('id', 'orderNumber')
    .where({ status: 'PAYMENT_PENDING' })
    .where((o) => o.paymentExpiresAt.lt(now as never))
    .limit(limit)
    .all()

  const expiredOrders: string[] = []
  for (const order of expired) {
    // Never expire an order PayTR actually charged because its notification was lost.
    const { reconciled } = await reconcileOrderPayment(order.orderNumber, { minIntervalMs: 0 }).catch((err) => {
      console.warn(`[payment.service] Reconcile before expiry failed for ${order.orderNumber}:`, err)
      return { reconciled: false }
    })
    if (reconciled) continue

    const open = await db.orm.public.Payment.where({ orderId: order.id, status: 'PENDING' }).all()
    for (const p of open) {
      if (await transitionPayment(p.id, ['PENDING'], 'CANCELLED')) {
        await db.orm.public.Payment.where({ id: p.id }).update({ failureReason: 'Ödeme oturum süresi doldu.' })
      }
    }

    const result = await updateOrderStatus(
      order.orderNumber,
      'PAYMENT_FAILED',
      'Ödeme süresi doldu; stok serbest bırakıldı.',
      'system'
    )
    if (result.success) {
      expiredOrders.push(order.orderNumber)
      await logAuditEvent({
        action: 'INVENTORY_TIMEOUT_CLEANUP',
        entity: 'Order',
        entityId: order.orderNumber,
        metadata: {},
      })
    }
  }

  return { cleanedCount: expiredOrders.length, expiredOrders }
}

/**
 * Triggers test/sandbox payment confirmation or rejection for local development.
 */
export async function processTestPayment(params: {
  orderNumber: string
  paymentId?: string
  simulateStatus: 'SUCCESS' | 'FAILED'
  failureReason?: string
}) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('PAYMENT_SIMULATION_DISABLED: Test ödeme simülasyonu bu ortamda kapalıdır.')
  }

  const order = await findOrderByNumber(params.orderNumber)
  if (!order) {
    throw new Error('Sipariş bulunamadı.')
  }

  const latest = await db.orm.public.Payment
    .where({ orderId: order.id })
    .orderBy((p) => p.attemptNumber.desc())
    .first()
  if (!latest?.merchantOid) {
    throw new Error('Bu sipariş için açık bir ödeme oturumu yok.')
  }

  const provider = getPaymentProvider() as unknown as {
    generateTestWebhook?: (
      merchantOid: string,
      amount: number,
      status: 'SUCCESS' | 'FAILED',
      failureReason?: string
    ) => { payload: Record<string, unknown>; signature: string }
  }
  if (typeof provider.generateTestWebhook !== 'function') {
    throw new Error('Aktif ödeme sağlayıcısı test simülasyonunu desteklemiyor.')
  }

  const { payload, signature } = provider.generateTestWebhook(
    latest.merchantOid,
    order.totalAmount,
    params.simulateStatus,
    params.failureReason
  )
  return handlePaymentWebhook(payload, signature)
}

/**
 * Retrieves payments for the admin view with optional filtering.
 */
export async function getAllPayments(filters?: {
  status?: string
  provider?: string
  search?: string
  limit?: number
}): Promise<StoredPayment[]> {
  let query = paymentQuery()

  if (filters?.status && filters.status !== 'ALL') {
    const status = filters.status
    query = query.where((p) => p.status.eq(status as never))
  }
  if (filters?.provider && filters.provider !== 'ALL') {
    const provider = filters.provider
    query = query.where((p) => p.provider.eq(provider as never))
  }
  if (filters?.search && filters.search.trim()) {
    const q = `%${filters.search.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`
    query = query.where((p) => or(p.id.ilike(q), p.merchantOid.ilike(q), p.providerRef.ilike(q)))
  }

  const rows = await query
    .orderBy((p) => p.createdAt.desc())
    .limit(Math.min(filters?.limit ?? 500, 2000))
    .all()
  return rows.map(toStoredPayment)
}
