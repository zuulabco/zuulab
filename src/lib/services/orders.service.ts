import 'server-only'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { verifyAndCalculateCart } from './products.service'
import { calculateShipping } from './shipping.service'
import { releaseInventoryReservation, reserveInventory, getInventoryStatus, commitInventoryReservation } from './inventory.service'
import { logAuditEvent } from './admin.service'
import { createNotification } from './notification/notification.service'

export interface CreateOrderPayload {
  userId: string
  items: Array<{ productId: string; variantId?: string | null; quantity: number }>
  couponCode?: string | null
  shippingMethod?: 'STANDARD' | 'EXPRESS'
  shippingAddress: {
    fullName: string
    phone: string
    addressLine: string
    city: string
    district: string
    postalCode: string
    country?: string
    email?: string
  }
  billingSameAsShipping?: boolean
  billingAddress?: {
    fullName: string
    phone: string
    addressLine: string
    city: string
    district: string
    postalCode: string
    country?: string
    companyName?: string
    taxOffice?: string
    taxNumber?: string
  }
  addressId?: string | null
  customerNote?: string
}

export interface OrderStatusHistoryItem {
  id: string
  status: string
  note?: string | null
  createdAt: string
  createdBy?: string | null
}

export interface StoredOrder {
  id: string
  orderNumber: string
  userId: string
  status: string
  paymentStatus: string
  fulfillmentStatus: string
  subtotal: number
  discountAmount: number
  shippingAmount: number
  shippingMethod: 'STANDARD' | 'EXPRESS'
  taxAmount: number
  totalAmount: number
  couponCode: string | null
  customerEmail?: string
  shippingAddressSnapshot: CreateOrderPayload['shippingAddress']
  billingAddressSnapshot?: CreateOrderPayload['billingAddress']
  customerNote: string | null
  addressId?: string | null
  createdAt: string
  updatedAt: string
  statusHistory: OrderStatusHistoryItem[]
  items: Array<{
    productId: string
    productName: string
    sku: string
    quantity: number
    unitPrice: number
    totalAmount: number
    taxRate: number
    imageUrl: string | null
  }>
}

const inMemoryOrders: StoredOrder[] = ((globalThis as any).__inMemoryOrders = (globalThis as any).__inMemoryOrders || [])

if (inMemoryOrders.length === 0) {
  const now = Date.now()
  inMemoryOrders.push(
    {
      id: 'ord-seed-01',
      orderNumber: 'ZUU-20268491',
      userId: 'usr-cust-1',
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      fulfillmentStatus: 'UNFULFILLED',
      subtotal: 558,
      discountAmount: 0,
      shippingAmount: 0,
      shippingMethod: 'STANDARD',
      taxAmount: 93,
      totalAmount: 558,
      couponCode: null,
      customerEmail: 'ahmet.yilmaz@gmail.com',
      shippingAddressSnapshot: {
        fullName: 'Ahmet Yılmaz',
        phone: '0532 555 1234',
        addressLine: 'Bağdat Cad. No: 142 D: 5',
        city: 'İstanbul',
        district: 'Kadıköy',
        postalCode: '34710',
        country: 'TR',
        email: 'ahmet.yilmaz@gmail.com',
      },
      customerNote: 'Lütfen kutulamaya özen gösterin, hediye olacaktır.',
      createdAt: new Date(now - 1000 * 60 * 45).toISOString(),
      updatedAt: new Date(now - 1000 * 60 * 45).toISOString(),
      statusHistory: [
        {
          id: 'hist-1',
          status: 'CONFIRMED',
          note: 'PayTR üzerinden ödeme onaylandı (₺558.00).',
          createdAt: new Date(now - 1000 * 60 * 45).toISOString(),
          createdBy: 'PayTR Webhook',
        },
      ],
      items: [
        {
          productId: 'prod-zk1',
          productName: 'Mini Dinozor Serisi — 6 Figür',
          sku: 'ZUU-KD-001',
          quantity: 2,
          unitPrice: 279,
          totalAmount: 558,
          taxRate: 20,
          imageUrl: 'https://images.unsplash.com/photo-1587654780291-39c9404d746b?auto=format&fit=crop&w=1000&q=80',
        },
      ],
      ...({ channel: 'DIRECT' } as any),
    },
    {
      id: 'ord-seed-02',
      orderNumber: 'ZUU-20268492',
      userId: 'usr-cust-2',
      status: 'PREPARING',
      paymentStatus: 'PAID',
      fulfillmentStatus: 'PROCESSING',
      subtotal: 798,
      discountAmount: 50,
      shippingAmount: 0,
      shippingMethod: 'EXPRESS',
      taxAmount: 124.67,
      totalAmount: 748,
      couponCode: 'ZUU50',
      customerEmail: 'zeynep.kaya@outlook.com',
      shippingAddressSnapshot: {
        fullName: 'Zeynep Kaya',
        phone: '0544 321 9876',
        addressLine: 'Tunalı Hilmi Cad. No: 88 D: 12',
        city: 'Ankara',
        district: 'Çankaya',
        postalCode: '06680',
        country: 'TR',
        email: 'zeynep.kaya@outlook.com',
      },
      customerNote: null,
      createdAt: new Date(now - 1000 * 60 * 120).toISOString(),
      updatedAt: new Date(now - 1000 * 60 * 60).toISOString(),
      statusHistory: [
        {
          id: 'hist-2a',
          status: 'PREPARING',
          note: 'Paketleme masasına aktarıldı.',
          createdAt: new Date(now - 1000 * 60 * 60).toISOString(),
          createdBy: 'depo-sorumlusu',
        },
        {
          id: 'hist-2b',
          status: 'CONFIRMED',
          note: 'Ödeme onaylandı.',
          createdAt: new Date(now - 1000 * 60 * 120).toISOString(),
          createdBy: 'iyzico Webhook',
        },
      ],
      items: [
        {
          productId: 'prod-zk2',
          productName: 'Eğitim Geometri Seti — Montessori',
          sku: 'ZUU-KD-002',
          quantity: 1,
          unitPrice: 349,
          totalAmount: 349,
          taxRate: 20,
          imageUrl: 'https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?auto=format&fit=crop&w=1000&q=80',
        },
        {
          productId: 'prod-zl1',
          productName: 'Voronoi Geometrik Vazo — Minimalist Sanat',
          sku: 'ZUU-VOR-001',
          quantity: 1,
          unitPrice: 449,
          totalAmount: 449,
          taxRate: 20,
          imageUrl: 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?auto=format&fit=crop&w=1000&q=80',
        },
      ],
      ...({ channel: 'DIRECT' } as any),
    },
    {
      id: 'ord-seed-03',
      orderNumber: 'ZUU-20268493',
      userId: 'usr-cust-3',
      status: 'SHIPPED',
      paymentStatus: 'PAID',
      fulfillmentStatus: 'SHIPPED',
      subtotal: 649,
      discountAmount: 0,
      shippingAmount: 49.90,
      shippingMethod: 'STANDARD',
      taxAmount: 108.17,
      totalAmount: 698.90,
      couponCode: null,
      customerEmail: 'can.ozdemir@gmail.com',
      shippingAddressSnapshot: {
        fullName: 'Can Özdemir',
        phone: '0555 111 2233',
        addressLine: 'Karşıyaka Mah. 1748 Sok. No: 15',
        city: 'İzmir',
        district: 'Karşıyaka',
        postalCode: '35580',
        country: 'TR',
        email: 'can.ozdemir@gmail.com',
      },
      customerNote: 'Site güvenliğine bırakılabilir.',
      createdAt: new Date(now - 1000 * 60 * 60 * 24).toISOString(),
      updatedAt: new Date(now - 1000 * 60 * 60 * 8).toISOString(),
      statusHistory: [
        {
          id: 'hist-3a',
          status: 'SHIPPED',
          note: 'Yurtiçi Kargo kuryesine teslim edildi. Takip: 139847192837',
          createdAt: new Date(now - 1000 * 60 * 60 * 8).toISOString(),
          createdBy: 'yurtici-kops-agent',
        },
      ],
      items: [
        {
          productId: 'prod-lt1',
          productName: 'Litofan Ay Lambası — Dokunmatik Ambiyans',
          sku: 'ZUU-LIT-004',
          quantity: 1,
          unitPrice: 649,
          totalAmount: 649,
          taxRate: 20,
          imageUrl: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1000&q=80',
        },
      ],
      ...({ channel: 'TRENDYOL' } as any),
    },
    {
      id: 'ord-seed-04',
      orderNumber: 'ZUU-20268494',
      userId: 'usr-cust-4',
      status: 'PAYMENT_PENDING',
      paymentStatus: 'PENDING',
      fulfillmentStatus: 'UNFULFILLED',
      subtotal: 589,
      discountAmount: 0,
      shippingAmount: 0,
      shippingMethod: 'STANDARD',
      taxAmount: 98.17,
      totalAmount: 589,
      couponCode: null,
      customerEmail: 'elif.demir@hotmail.com',
      shippingAddressSnapshot: {
        fullName: 'Elif Demir',
        phone: '0533 999 8877',
        addressLine: 'Fener Mah. 1965 Sok. Lara Apt.',
        city: 'Antalya',
        district: 'Muratpaşa',
        postalCode: '07160',
        country: 'TR',
        email: 'elif.demir@hotmail.com',
      },
      customerNote: null,
      createdAt: new Date(now - 1000 * 60 * 15).toISOString(),
      updatedAt: new Date(now - 1000 * 60 * 15).toISOString(),
      statusHistory: [
        {
          id: 'hist-4',
          status: 'PAYMENT_PENDING',
          note: 'PayTR 3D Secure ekranı başlatıldı.',
          createdAt: new Date(now - 1000 * 60 * 15).toISOString(),
          createdBy: 'checkout',
        },
      ],
      items: [
        {
          productId: 'prod-zl2',
          productName: 'Aura Spiralli Masa Lambası',
          sku: 'ZUU-AUR-002',
          quantity: 1,
          unitPrice: 589,
          totalAmount: 589,
          taxRate: 20,
          imageUrl: 'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&w=1000&q=80',
        },
      ],
      ...({ channel: 'HEPSIBURADA' } as any),
    },
    {
      id: 'ord-seed-05',
      orderNumber: 'ZUU-20268495',
      userId: 'usr-cust-5',
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      fulfillmentStatus: 'DELIVERED',
      subtotal: 389,
      discountAmount: 0,
      shippingAmount: 0,
      shippingMethod: 'STANDARD',
      taxAmount: 64.83,
      totalAmount: 389,
      couponCode: null,
      customerEmail: 'murat.celik@gmail.com',
      shippingAddressSnapshot: {
        fullName: 'Murat Çelik',
        phone: '0505 444 3322',
        addressLine: 'Nilüfer Barış Mah. Ihlamur Cad.',
        city: 'Bursa',
        district: 'Nilüfer',
        postalCode: '16140',
        country: 'TR',
        email: 'murat.celik@gmail.com',
      },
      customerNote: null,
      createdAt: new Date(now - 1000 * 60 * 60 * 72).toISOString(),
      updatedAt: new Date(now - 1000 * 60 * 60 * 24).toISOString(),
      statusHistory: [
        {
          id: 'hist-5',
          status: 'DELIVERED',
          note: 'Teslimat tamamlandı (Alıcı bizzat teslim aldı).',
          createdAt: new Date(now - 1000 * 60 * 60 * 24).toISOString(),
          createdBy: 'yurtici-webhook',
        },
      ],
      items: [
        {
          productId: 'prod-zl3',
          productName: 'Hexagon Modüler Duvar Paneli — 6 Parça',
          sku: 'ZUU-HEX-003',
          quantity: 1,
          unitPrice: 389,
          totalAmount: 389,
          taxRate: 20,
          imageUrl: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1000&q=80',
        },
      ],
      ...({ channel: 'DIRECT' } as any),
    }
  )
}

export const VALID_ORDER_TRANSITIONS: Record<string, string[]> = {
  PAYMENT_PENDING: ['PAYMENT_RECEIVED', 'CONFIRMED', 'PAYMENT_FAILED', 'CANCELLED'],
  PAYMENT_FAILED: ['PAYMENT_PENDING', 'CANCELLED'],
  PAYMENT_RECEIVED: ['CONFIRMED', 'PREPARING', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'IN_PRODUCTION', 'CANCELLED'],
  PREPARING: ['IN_PRODUCTION', 'PACKING', 'SHIPPED', 'CANCELLED'],
  IN_PRODUCTION: ['PACKING', 'SHIPPED', 'CANCELLED'],
  PACKING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'RETURN_REQUESTED'],
  DELIVERED: ['RETURN_REQUESTED'],
  RETURN_REQUESTED: ['RETURNED', 'DELIVERED'],
  RETURNED: ['PARTIALLY_REFUNDED'],
  CANCELLED: [],
}

/**
 * Generates a unique, collision-resistant branded order number: e.g. ZUU-202684918234
 */
function generateOrderNumber(): string {
  const currentYear = new Date().getFullYear()
  let candidate = ''
  let attempts = 0

  do {
    const timeFragment = Date.now().toString().slice(-4)
    const rand = Math.floor(1000 + Math.random() * 9000)
    candidate = `ZUU-${currentYear}${timeFragment}${rand}`
    attempts++
  } while (inMemoryOrders.some((o) => o.orderNumber === candidate) && attempts < 10)

  return candidate
}

/**
 * Authoritatively creates a real order and reserves inventory
 */
export async function createOrder(payload: CreateOrderPayload): Promise<StoredOrder> {
  const {
    userId,
    items,
    couponCode,
    shippingMethod = 'STANDARD',
    shippingAddress,
    billingSameAsShipping = true,
    billingAddress,
    addressId,
    customerNote,
  } = payload

  // 1. Authoritative price recalculation
  const verifiedCart = await verifyAndCalculateCart(items, couponCode)

  if (verifiedCart.items.length === 0) {
    throw new Error('Sipariş oluşturmak için sepetinizde geçerli ürün bulunamadı.')
  }

  // 2. Shipping calculation
  const shippingCalc = calculateShipping(
    verifiedCart.subtotal,
    shippingMethod,
    verifiedCart.coupon?.type === 'FREE_SHIPPING'
  )

  const effectiveShipping = shippingCalc.shippingFee
  const taxAmount = Math.round(verifiedCart.subtotal * 0.2 * 100) / 100
  const finalTotal = Math.max(
    0,
    verifiedCart.subtotal - verifiedCart.discountAmount + effectiveShipping
  )

  const orderNumber = generateOrderNumber()

  // 3. Reserve inventory before finalizing order initiation
  const reservationResult = await reserveInventory(
    items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
    orderNumber
  )

  if (!reservationResult.success) {
    throw new Error(reservationResult.error || 'Stok rezervasyonu başarısız oldu.')
  }

  const now = new Date().toISOString()
  const initialHistory: OrderStatusHistoryItem = {
    id: `hist-${Date.now()}-1`,
    status: 'PAYMENT_PENDING',
    note: 'Sipariş oluşturuldu, ödeme bekleniyor.',
    createdAt: now,
    createdBy: 'system',
  }

  const orderRecord: StoredOrder = {
    id: `ord-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    orderNumber,
    userId,
    status: 'PAYMENT_PENDING',
    paymentStatus: 'PENDING',
    fulfillmentStatus: 'UNFULFILLED',
    subtotal: verifiedCart.subtotal,
    discountAmount: verifiedCart.discountAmount,
    shippingAmount: effectiveShipping,
    shippingMethod,
    taxAmount,
    totalAmount: finalTotal,
    couponCode: verifiedCart.coupon?.code || null,
    customerEmail: shippingAddress.email,
    shippingAddressSnapshot: shippingAddress,
    billingAddressSnapshot: billingSameAsShipping ? shippingAddress : billingAddress,
    addressId: addressId || null,
    customerNote: customerNote || null,
    createdAt: now,
    updatedAt: now,
    statusHistory: [initialHistory],
    items: verifiedCart.items.map((i) => ({
      productId: i.productId,
      productName: i.name,
      sku: i.sku,
      quantity: i.quantity,
      unitPrice: i.price,
      totalAmount: i.subtotal,
      taxRate: i.taxRate || 20,
      imageUrl: i.imageUrl,
    })),
  }

  // 4. Persist to PostgreSQL if configured
  if (isDatabaseConfigured) {
    try {
      await db.orm.public.Order.create({
        orderNumber,
        userId,
        addressId: addressId || null,
        status: 'PAYMENT_PENDING',
        subtotal: verifiedCart.subtotal.toString() as any,
        discountAmount: verifiedCart.discountAmount.toString() as any,
        shippingCost: effectiveShipping.toString() as any,
        taxAmount: taxAmount.toString() as any,
        total: finalTotal.toString() as any,
        shipToName: shippingAddress.fullName,
        shipToPhone: shippingAddress.phone,
        shipToAddress: shippingAddress.addressLine,
        shipToCity: shippingAddress.city,
        shipToDistrict: shippingAddress.district,
        shipToPostal: shippingAddress.postalCode,
        shipToCountry: shippingAddress.country || 'TR',
        couponCode: verifiedCart.coupon?.code || null,
        customerNote: customerNote || null,
      })
    } catch (err) {
      console.warn('[orders.service] DB order create failed, falling back to memory:', err)
    }
  }

  inMemoryOrders.unshift(orderRecord)

  await logAuditEvent({
    userId,
    action: 'ORDER_CREATED',
    entity: 'Order',
    entityId: orderNumber,
    metadata: {
      total: finalTotal,
      itemCount: orderRecord.items.length,
      shippingMethod,
    },
  })

  // Trigger notification asynchronously (non-blocking)
  createNotification({ orderNumber, eventType: 'ORDER_CREATED' }).catch((err) => {
    console.warn('[orders.service] Error sending ORDER_CREATED notification:', err)
  })

  return orderRecord
}

/**
 * Validates and updates order status through the central transition machine
 */
export async function updateOrderStatus(
  orderNumber: string,
  targetStatus: string,
  note?: string,
  changedBy = 'system'
): Promise<{ success: boolean; order?: StoredOrder; error?: string }> {
  const order = inMemoryOrders.find((o) => o.orderNumber === orderNumber)
  if (!order) {
    return { success: false, error: 'Sipariş bulunamadı.' }
  }

  const allowed = VALID_ORDER_TRANSITIONS[order.status] || []
  if (!allowed.includes(targetStatus)) {
    return {
      success: false,
      error: `Geçersiz durum geçişi: '${order.status}' durumundaki sipariş '${targetStatus}' yapılamaz.`,
    }
  }

  const now = new Date().toISOString()
  const historyItem: OrderStatusHistoryItem = {
    id: `hist-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    status: targetStatus,
    note: note || `Sipariş durumu güncellendi: ${targetStatus}`,
    createdAt: now,
    createdBy: changedBy,
  }

  order.status = targetStatus
  order.updatedAt = now
  order.statusHistory.unshift(historyItem)

  // Handle inventory and fulfillment status based on status change
  if (targetStatus === 'CANCELLED') {
    // Release inventory reservation for any order cancelled before shipment
    await releaseInventoryReservation(
      order.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      orderNumber,
      {
        context: 'DIRECT',
        reason: `Sipariş İptal Edildi (${orderNumber}) - Rezervasyon Serbest Bırakma`,
      }
    )
    order.fulfillmentStatus = 'CANCELLED'

    await logAuditEvent({
      action: 'ORDER_CANCELLED',
      entity: 'Order',
      entityId: orderNumber,
      metadata: { changedBy, note },
    })
  } else if (targetStatus === 'SHIPPED') {
    order.fulfillmentStatus = 'SHIPPED'
    await commitInventoryReservation(
      order.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      orderNumber,
      {
        context: 'DIRECT',
        reason: `Sipariş Sevk Edildi (${orderNumber}) - Fiziksel Stok Düşümü`,
      }
    )
  } else if (targetStatus === 'DELIVERED') {
    order.fulfillmentStatus = 'DELIVERED'
  } else if (targetStatus === 'CONFIRMED' || targetStatus === 'PAYMENT_RECEIVED') {
    order.paymentStatus = 'PAID'
  }

  // Update in PostgreSQL if configured
  if (isDatabaseConfigured) {
    try {
      await db.orm.public.Order.where({ orderNumber }).update({
        status: targetStatus as any,
      })
      await db.orm.public.OrderStatusHistory.create({
        orderId: order.id,
        status: targetStatus as any,
        note: note || null,
        createdBy: changedBy,
      })
    } catch (err) {
      console.warn('[orders.service] DB status update failed:', err)
    }
  }

  await logAuditEvent({
    action: 'ORDER_STATUS_CHANGED',
    entity: 'Order',
    entityId: orderNumber,
    metadata: {
      fromStatus: order.status,
      toStatus: targetStatus,
      changedBy,
      note,
    },
  })

  // Trigger transactional notifications asynchronously (non-blocking)
  let notifType: any = null
  if (targetStatus === 'CONFIRMED') notifType = 'ORDER_CONFIRMED'
  else if (targetStatus === 'PREPARING' || targetStatus === 'PROCESSING') notifType = 'ORDER_PREPARING'
  else if (targetStatus === 'SHIPPED') notifType = 'ORDER_SHIPPED'
  else if (targetStatus === 'DELIVERED') notifType = 'ORDER_DELIVERED'
  else if (targetStatus === 'CANCELLED') notifType = 'ORDER_CANCELLED'

  if (notifType) {
    createNotification({
      orderNumber,
      eventType: notifType,
      metadata: notifType === 'ORDER_CANCELLED' ? { cancellationReason: note } : undefined,
    }).catch((err) => {
      console.warn(`[orders.service] Error queueing ${notifType} notification:`, err)
    })
  }

  return { success: true, order }
}

/**
 * Retrieves orders for a specific user
 */
export async function getUserOrders(userId: string): Promise<StoredOrder[]> {
  return inMemoryOrders.filter((o) => o.userId === userId)
}

/**
 * Retrieves an order by order number with strict ownership authorization
 */
export async function getOrderByNumber(
  orderNumber: string,
  userId?: string,
  isAdmin = false
): Promise<any | null> {
  const found = inMemoryOrders.find((o) => o.orderNumber === orderNumber)
  if (!found) return null

  // Security check: non-admin can only view their own order
  if (!isAdmin && userId && found.userId !== userId) {
    return null
  }

  if (isAdmin) {
    const enrichedItems = await Promise.all(
      found.items.map(async (item) => {
        try {
          const inv = await getInventoryStatus(item.productId)
          return {
            ...item,
            currentStock: inv.stock,
            availableStock: inv.available,
            hasStockShortage: inv.available < item.quantity,
          }
        } catch {
          return {
            ...item,
            currentStock: 0,
            availableStock: 0,
            hasStockShortage: true,
          }
        }
      })
    )

    return {
      ...found,
      channel: (found as any).channel || 'DIRECT',
      items: enrichedItems,
    }
  }

  return found
}

/**
 * Retrieves all orders for the admin panel with optional filters
 */
export async function getAllOrders(filters?: {
  status?: string
  paymentStatus?: string
  search?: string
  channel?: string
  limit?: number
}): Promise<StoredOrder[]> {
  let list = inMemoryOrders.map((o) => ({
    ...o,
    channel: (o as any).channel || 'DIRECT',
  }))

  if (filters?.channel && filters.channel !== 'ALL') {
    list = list.filter((o: any) => o.channel === filters.channel)
  }

  if (filters?.status && filters.status !== 'ALL') {
    list = list.filter((o) => o.status === filters.status)
  }

  if (filters?.paymentStatus && filters.paymentStatus !== 'ALL') {
    list = list.filter((o) => o.paymentStatus === filters.paymentStatus)
  }

  if (filters?.search) {
    const q = filters.search.toLowerCase()
    list = list.filter(
      (o) =>
        o.orderNumber.toLowerCase().includes(q) ||
        o.shippingAddressSnapshot.fullName.toLowerCase().includes(q) ||
        (o.customerEmail && o.customerEmail.toLowerCase().includes(q))
    )
  }

  if (filters?.limit) {
    list = list.slice(0, filters.limit)
  }

  return list
}
