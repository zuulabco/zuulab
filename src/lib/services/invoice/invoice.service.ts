import 'server-only'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { getOrderByNumber, updateOrderStatus } from '../orders.service'
import { logAuditEvent } from '../admin.service'
import { getInvoiceProvider } from './invoice-provider.factory'
import type {
  StoredInvoice,
  CreateInvoiceRequest,
  BillingAddressInfo,
  InvoiceLineItem,
} from './invoice.interface'

const inMemoryInvoices: StoredInvoice[] = []
const inFlightInvoiceCreations = new Map<string, Promise<StoredInvoice>>()

/**
 * Creates an e-Fatura / e-Arşiv invoice for an order.
 * Strictly verifies payment status is SUCCEEDED, enforces idempotency,
 * and preserves historical billing snapshot.
 */
export async function createInvoiceForOrder(params: {
  orderNumber: string
  requestedBy?: string
}): Promise<StoredInvoice> {
  // Concurrency guard: If a request for this order is already in-flight, return the same promise
  if (inFlightInvoiceCreations.has(params.orderNumber)) {
    return inFlightInvoiceCreations.get(params.orderNumber)!
  }

  const creationPromise = executeCreateInvoice(params)
  inFlightInvoiceCreations.set(params.orderNumber, creationPromise)

  try {
    return await creationPromise
  } finally {
    inFlightInvoiceCreations.delete(params.orderNumber)
  }
}

async function executeCreateInvoice(params: {
  orderNumber: string
  requestedBy?: string
}): Promise<StoredInvoice> {
  const order = await getOrderByNumber(params.orderNumber, undefined, true)
  if (!order) {
    throw new Error(`Sipariş bulunamadı: #${params.orderNumber}`)
  }

  // 1. Payment state verification: ONLY SUCCEEDED orders can be invoiced
  if (order.status !== 'CONFIRMED' && order.paymentStatus !== 'PAID') {
    // Check if order payment record is succeeded
    const isPaid = order.status === 'CONFIRMED' || order.status === 'SHIPPED' || order.status === 'DELIVERED'
    if (!isPaid) {
      await logAuditEvent({
        action: 'INVOICE_CREATION_REJECTED',
        entity: 'Order',
        entityId: order.orderNumber,
        metadata: {
          reason: 'ORDER_NOT_PAID',
          orderStatus: order.status,
          paymentStatus: order.paymentStatus,
        },
      })
      throw new Error(
        `Ödemesi tamamlanmamış sipariş için fatura oluşturulamaz. (Mevcut Durum: ${order.status})`
      )
    }
  }

  // 2. IDEMPOTENCY CHECK: If an active invoice already exists and is ISSUED or SUBMITTED, return it (Database + Serverless Safe)
  if (isDatabaseConfigured) {
    try {
      const dbInvoice = await (db.orm.public.Invoice as any).findFirst({
        where: {
          orderId: order.id,
          status: { in: ['PAID', 'SENT', 'CREATED'] },
        },
      })
      if (dbInvoice) {
        const mappedStatus = dbInvoice.status === 'CREATED' || dbInvoice.status === 'SENT' || dbInvoice.status === 'PAID' ? 'ISSUED' : 'PENDING'
        const existingBillingSnapshot: BillingAddressInfo = {
          type: order.billingAddressSnapshot?.companyName ? 'CORPORATE' : 'INDIVIDUAL',
          fullName: order.billingAddressSnapshot?.fullName || order.shippingAddressSnapshot.fullName,
          companyName: order.billingAddressSnapshot?.companyName || null,
          vknTckn: order.billingAddressSnapshot?.taxNumber || '11111111111',
          taxOffice: order.billingAddressSnapshot?.taxOffice || null,
          taxNumber: order.billingAddressSnapshot?.taxNumber || null,
          addressLine: order.billingAddressSnapshot?.addressLine || order.shippingAddressSnapshot.addressLine,
          city: order.billingAddressSnapshot?.city || order.shippingAddressSnapshot.city,
          district: order.billingAddressSnapshot?.district || order.shippingAddressSnapshot.district,
          postalCode: order.billingAddressSnapshot?.postalCode || order.shippingAddressSnapshot.postalCode,
          country: order.billingAddressSnapshot?.country || order.shippingAddressSnapshot.country || 'TR',
        }

        const existing: StoredInvoice = {
          id: dbInvoice.id,
          orderId: order.id,
          orderNumber: order.orderNumber,
          invoiceNumber: dbInvoice.invoiceNumber || `EAR2026${order.orderNumber.replace(/[^0-9]/g, '')}`,
          invoiceType: (dbInvoice.type as any) || 'E_ARSIV',
          status: mappedStatus as any,
          totalAmount: Number(dbInvoice.total),
          taxAmount: Number(dbInvoice.taxTotal || 0),
          subtotal: Number(order.subtotal || 0),
          shippingAmount: Number(order.shippingAmount || 0),
          discountAmount: Number(order.discountAmount || 0),
          currency: dbInvoice.currency,
          billingSnapshot: existingBillingSnapshot,
          provider: 'UYUMSOFT',
          providerInvoiceId: dbInvoice.providerRef || undefined,
          createdAt: dbInvoice.createdAt.toISOString(),
          updatedAt: dbInvoice.updatedAt.toISOString(),
          issuedAt: dbInvoice.createdAt.toISOString(),
          retryCount: 0,
        }

        await logAuditEvent({
          action: 'INVOICE_IDEMPOTENT_BYPASS',
          entity: 'Invoice',
          entityId: existing.id,
          metadata: {
            orderNumber: order.orderNumber,
            invoiceNumber: existing.invoiceNumber,
            source: 'DATABASE_RECORD',
          },
        })
        return existing
      }
    } catch (err) {
      console.warn('[invoice.service] Error checking DB for existing invoice:', err)
    }
  }

  const existingInvoice = inMemoryInvoices.find((inv) => inv.orderNumber === order.orderNumber)
  if (existingInvoice && (existingInvoice.status === 'ISSUED' || existingInvoice.status === 'SUBMITTED')) {
    await logAuditEvent({
      action: 'INVOICE_IDEMPOTENT_BYPASS',
      entity: 'Invoice',
      entityId: existingInvoice.id,
      metadata: {
        orderNumber: order.orderNumber,
        invoiceNumber: existingInvoice.invoiceNumber,
      },
    })
    return existingInvoice
  }

  // 3. Amount and Financial Integrity Verification
  const expectedTotal = Math.max(
    0,
    order.subtotal - order.discountAmount + order.shippingAmount
  )
  const diff = Math.abs(expectedTotal - order.totalAmount)
  if (diff > 0.05) {
    await logAuditEvent({
      action: 'INVOICE_AMOUNT_MISMATCH',
      entity: 'Order',
      entityId: order.orderNumber,
      metadata: { expectedTotal, actualTotal: order.totalAmount },
    })
    throw new Error(
      `Fatura tutar uyuşmazlığı: Hesaplanan (${expectedTotal} TL) ile sipariş tutarı (${order.totalAmount} TL) eşleşmiyor.`
    )
  }

  // 4. Extract Historical Billing Snapshot
  const billingSource = order.billingAddressSnapshot || order.shippingAddressSnapshot
  const isCorporate = Boolean(
    (billingSource as any).companyName ||
    (billingSource as any).taxOffice ||
    (billingSource as any).taxNumber
  )

  // Use customer's real TCKN/VKN if provided; only fall back to GİB retail code 11111111111 for individual consumers without TCKN
  const explicitTaxId = (billingSource as any).taxNumber || (billingSource as any).tckn
  const resolvedVknTckn = explicitTaxId ? String(explicitTaxId).trim() : (isCorporate ? '' : '11111111111')

  const billingSnapshot: BillingAddressInfo = {
    type: isCorporate ? 'CORPORATE' : 'INDIVIDUAL',
    fullName: billingSource.fullName || 'Değerli Müşterimiz',
    companyName: (billingSource as any).companyName || null,
    vknTckn: resolvedVknTckn,
    taxOffice: (billingSource as any).taxOffice || null,
    taxNumber: (billingSource as any).taxNumber || null,
    addressLine: billingSource.addressLine || 'Adres belirtilmedi',
    city: billingSource.city || 'İstanbul',
    district: billingSource.district || 'Kadıköy',
    postalCode: billingSource.postalCode || '34000',
    country: billingSource.country || 'TR',
    email: order.customerEmail || null,
    phone: billingSource.phone || null,
  }

  // 5. Build Invoice Line Items with snapshotted tax rate & amounts
  const items: InvoiceLineItem[] = order.items.map((item: any) => {
    const taxRate = (item as any).taxRate ?? 20 // Uses snapshotted order item VAT rate, fallback 20%
    const lineTotal = item.totalAmount
    const taxAmount = Math.round((lineTotal - lineTotal / (1 + taxRate / 100)) * 100) / 100
    return {
      productId: item.productId,
      name: item.productName,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      taxRate,
      taxAmount,
      lineTotal,
    }
  })

  // 6. Request invoice from Provider (Uyumsoft or Mock)
  const provider = getInvoiceProvider()
  const createRequest: CreateInvoiceRequest = {
    orderNumber: order.orderNumber,
    orderId: order.id,
    totalAmount: order.totalAmount,
    subtotal: order.subtotal,
    taxAmount: order.taxAmount,
    shippingAmount: order.shippingAmount,
    discountAmount: order.discountAmount,
    currency: 'TRY',
    billing: billingSnapshot,
    items,
    customerNote: order.customerNote,
  }

  const result = await provider.createInvoice(createRequest)

  const now = new Date().toISOString()
  const invoiceId = existingInvoice?.id || `inv-${Date.now()}-${Math.floor(Math.random() * 1000)}`

  const invoiceRecord: StoredInvoice = {
    id: invoiceId,
    orderId: order.id,
    orderNumber: order.orderNumber,
    provider: provider.name,
    providerInvoiceId: result.providerInvoiceId || null,
    invoiceNumber: result.invoiceNumber || null,
    invoiceType: result.invoiceType,
    status: result.status,
    invoiceDate: result.issueDate || now,
    pdfUrl: result.pdfUrl || `/api/admin/orders/${order.orderNumber}/invoice/document`,
    pdfData: result.pdfData || null,
    totalAmount: order.totalAmount,
    taxAmount: order.taxAmount,
    subtotal: order.subtotal,
    shippingAmount: order.shippingAmount,
    discountAmount: order.discountAmount,
    currency: 'TRY',
    errorMessage: result.errorMessage || null,
    retryCount: (existingInvoice?.retryCount || 0) + (result.success ? 0 : 1),
    billingSnapshot,
    createdAt: existingInvoice?.createdAt || now,
    updatedAt: now,
    submittedAt: now,
    issuedAt: result.status === 'ISSUED' ? now : null,
  }

  // Update or insert into memory
  const existingIdx = inMemoryInvoices.findIndex((i) => i.id === invoiceId)
  if (existingIdx >= 0) {
    inMemoryInvoices[existingIdx] = invoiceRecord
  } else {
    inMemoryInvoices.unshift(invoiceRecord)
  }

  // Persist to PostgreSQL if configured
  if (isDatabaseConfigured) {
    try {
      await db.orm.public.Invoice.create({
        orderId: order.id,
        provider: 'UYUMSOFT' as any,
        status: (result.status === 'ISSUED' ? 'CREATED' : 'FAILED') as any,
        invoiceNumber: result.invoiceNumber || null,
        invoiceDate: new Date(),
        pdfUrl: invoiceRecord.pdfUrl,
        providerRef: result.providerInvoiceId || null,
        totalAmount: order.totalAmount.toString() as any,
        taxAmount: order.taxAmount.toString() as any,
        errorMessage: result.errorMessage || null,
        retryCount: invoiceRecord.retryCount,
      })
    } catch (dbErr) {
      console.warn('[invoice.service] DB invoice persist failed:', dbErr)
    }
  }

  // Log Audit Event
  await logAuditEvent({
    action: result.success ? 'INVOICE_CREATED' : 'INVOICE_FAILED',
    entity: 'Invoice',
    entityId: invoiceRecord.id,
    metadata: {
      orderNumber: order.orderNumber,
      invoiceNumber: result.invoiceNumber,
      provider: provider.name,
      status: result.status,
      invoiceType: result.invoiceType,
      requestedBy: params.requestedBy || 'system',
      errorMessage: result.errorMessage,
    },
  })

  if (!result.success) {
    throw new Error(result.errorMessage || 'Fatura oluşturulamadı.')
  }

  return invoiceRecord
}

/**
 * Retries creating a previously failed invoice
 */
export async function retryInvoiceForOrder(params: {
  orderNumber: string
  requestedBy?: string
}): Promise<StoredInvoice> {
  const existing = inMemoryInvoices.find((i) => i.orderNumber === params.orderNumber)
  if (existing && existing.status === 'ISSUED') {
    return existing
  }

  await logAuditEvent({
    action: 'INVOICE_RETRY_REQUESTED',
    entity: 'Invoice',
    entityId: existing?.id || params.orderNumber,
    metadata: { orderNumber: params.orderNumber, requestedBy: params.requestedBy },
  })

  return createInvoiceForOrder(params)
}

/**
 * Queries provider status and synchronizes the local invoice state
 */
export async function syncInvoiceStatus(orderNumber: string): Promise<StoredInvoice> {
  const invoice = inMemoryInvoices.find((i) => i.orderNumber === orderNumber)
  if (!invoice) {
    throw new Error(`Fatura kaydı bulunamadı: #${orderNumber}`)
  }

  if (!invoice.providerInvoiceId) {
    return invoice
  }

  const provider = getInvoiceProvider()
  const statusRes = await provider.queryStatus(invoice.providerInvoiceId)

  invoice.status = statusRes.status
  invoice.updatedAt = new Date().toISOString()
  if (statusRes.status === 'ISSUED' && !invoice.issuedAt) {
    invoice.issuedAt = new Date().toISOString()
  }

  await logAuditEvent({
    action: 'INVOICE_STATUS_SYNCED',
    entity: 'Invoice',
    entityId: invoice.id,
    metadata: {
      orderNumber,
      newStatus: statusRes.status,
      providerStatus: statusRes.providerStatus,
    },
  })

  return invoice
}

/**
 * Retrieves invoice PDF data with strict access authorization
 */
export async function getInvoiceDocument(params: {
  orderNumber: string
  userId?: string
  isAdmin?: boolean
}): Promise<{ pdfData: string; fileName: string }> {
  const order = await getOrderByNumber(params.orderNumber, undefined, true)
  if (!order) {
    throw new Error('Sipariş bulunamadı.')
  }

  // Customer authorization check
  if (!params.isAdmin) {
    if (!params.userId || order.userId !== params.userId) {
      throw new Error('FORBIDDEN: Bu faturayı görüntüleme yetkiniz bulunmamaktadır.')
    }
  }

  const invoice = inMemoryInvoices.find((i) => i.orderNumber === params.orderNumber)
  if (!invoice) {
    throw new Error('Bu sipariş için henüz fatura oluşturulmamış.')
  }

  if (invoice.status !== 'ISSUED') {
    throw new Error(`Fatura henüz hazır değil. (Durum: ${invoice.status})`)
  }

  const provider = getInvoiceProvider()
  let base64Pdf = invoice.pdfData

  if (!base64Pdf && invoice.providerInvoiceId) {
    const res = await provider.getPdf(invoice.providerInvoiceId)
    if (res.success && res.pdfData) {
      base64Pdf = res.pdfData
      invoice.pdfData = base64Pdf
    }
  }

  if (!base64Pdf) {
    // Fallback printable base64 PDF
    const dummy = `%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >> endobj\n4 0 obj << /Length 50 >> stream\nBT /F1 14 Tf 50 750 Td (ZUULAB FATURA: #${invoice.invoiceNumber}) Tj ET\nendstream endobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000214 00000 n \ntrailer << /Size 5 /Root 1 0 R >>\nstartxref\n314\n%%EOF`
    base64Pdf = Buffer.from(dummy).toString('base64')
  }

  await logAuditEvent({
    action: 'INVOICE_PDF_ACCESSED',
    entity: 'Invoice',
    entityId: invoice.id,
    metadata: {
      orderNumber: invoice.orderNumber,
      invoiceNumber: invoice.invoiceNumber,
      accessedBy: params.isAdmin ? 'admin' : params.userId,
    },
  })

  return {
    pdfData: base64Pdf,
    fileName: `${invoice.invoiceNumber || invoice.orderNumber}.pdf`,
  }
}

/**
 * Retrieves invoice record by order number
 */
export async function getInvoiceByOrderNumber(orderNumber: string): Promise<StoredInvoice | null> {
  const invoice = inMemoryInvoices.find((i) => i.orderNumber === orderNumber)
  return invoice || null
}

/**
 * Retrieves all invoices for the admin view with server-side filtering
 */
export async function getAllInvoices(filters?: {
  status?: string
  invoiceType?: string
  search?: string
  limit?: number
}): Promise<StoredInvoice[]> {
  let list = [...inMemoryInvoices]

  if (filters?.status && filters.status !== 'ALL') {
    list = list.filter((i) => i.status === filters.status)
  }

  if (filters?.invoiceType && filters.invoiceType !== 'ALL') {
    list = list.filter((i) => i.invoiceType === filters.invoiceType)
  }

  if (filters?.search) {
    const q = filters.search.toLowerCase()
    list = list.filter(
      (i) =>
        i.orderNumber.toLowerCase().includes(q) ||
        (i.invoiceNumber && i.invoiceNumber.toLowerCase().includes(q)) ||
        (i.billingSnapshot.companyName &&
          i.billingSnapshot.companyName.toLowerCase().includes(q)) ||
        i.billingSnapshot.fullName.toLowerCase().includes(q)
    )
  }

  if (filters?.limit) {
    list = list.slice(0, filters.limit)
  }

  return list
}
