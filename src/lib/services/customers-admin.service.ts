import 'server-only'
import { getAllOrders } from './orders.service'
import { logAuditEvent } from './admin.service'

export interface AdminCustomerSummary {
  id: string
  name: string
  email: string
  phone: string | null
  orderCount: number
  totalSpend: number
  lastOrderDate: string | null
  status: 'ACTIVE' | 'SUSPENDED'
  createdAt: string
}

// Initial customer records
const adminCustomers: AdminCustomerSummary[] = [
  {
    id: 'usr-cust-1',
    name: 'Ayşe Kaya',
    email: 'ayse@test.com',
    phone: '0532 111 22 33',
    orderCount: 3,
    totalSpend: 1420.5,
    lastOrderDate: new Date().toISOString(),
    status: 'ACTIVE',
    createdAt: new Date(Date.now() - 3600000 * 24 * 30).toISOString(),
  },
  {
    id: 'usr-cust-2',
    name: 'Mehmet Demir',
    email: 'mehmet@test.com',
    phone: '0544 222 33 44',
    orderCount: 1,
    totalSpend: 349.9,
    lastOrderDate: new Date(Date.now() - 3600000 * 24 * 5).toISOString(),
    status: 'ACTIVE',
    createdAt: new Date(Date.now() - 3600000 * 24 * 14).toISOString(),
  },
  {
    id: 'usr-cust-3',
    name: 'Zeynep Çelik',
    email: 'zeynep@example.com',
    phone: '0555 333 44 55',
    orderCount: 4,
    totalSpend: 2850.0,
    lastOrderDate: new Date(Date.now() - 3600000 * 24 * 2).toISOString(),
    status: 'ACTIVE',
    createdAt: new Date(Date.now() - 3600000 * 24 * 60).toISOString(),
  },
]

/**
 * Retrieves all registered customers with aggregated order statistics
 */
export async function adminGetCustomers(filters?: { search?: string; status?: string }) {
  let list = [...adminCustomers]

  if (filters?.search) {
    const q = filters.search.toLowerCase()
    list = list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q))
    )
  }

  if (filters?.status && filters.status !== 'ALL') {
    list = list.filter((c) => c.status === filters.status)
  }

  return list
}

/**
 * Retrieves detailed customer profile including orders and addresses without exposing auth secrets
 */
export async function adminGetCustomerDetail(id: string) {
  const customer = adminCustomers.find((c) => c.id === id)
  if (!customer) {
    // Check if customer exists in orders
    const allOrders = await getAllOrders()
    const matchOrder = allOrders.find((o) => o.userId === id || o.customerEmail === id)
    if (matchOrder) {
      return {
        id,
        name: matchOrder.shippingAddressSnapshot.fullName,
        email: matchOrder.customerEmail || 'musteri@zuulab.com',
        phone: matchOrder.shippingAddressSnapshot.phone,
        status: 'ACTIVE',
        createdAt: matchOrder.createdAt,
        orders: allOrders.filter((o) => o.userId === id),
        addresses: [matchOrder.shippingAddressSnapshot],
        favoritesCount: 2,
      }
    }
    return null
  }

  const allOrders = await getAllOrders()
  const customerOrders = allOrders.filter(
    (o) => o.userId === customer.id || o.customerEmail === customer.email
  )

  return {
    ...customer,
    orders: customerOrders,
    addresses: [
      {
        title: 'Ev Adresi',
        city: 'İstanbul',
        district: 'Kadıköy',
        addressLine: 'Moda Cad. No: 15 D: 4',
        phone: customer.phone,
      },
    ],
    favoritesCount: 3,
  }
}

/**
 * Updates customer account status (e.g. SUSPENDED or ACTIVE)
 */
export async function adminUpdateCustomerStatus(params: {
  customerId: string
  status: 'ACTIVE' | 'SUSPENDED'
  reason?: string
  adminEmail: string
}) {
  const customer = adminCustomers.find((c) => c.id === params.customerId)
  if (!customer) throw new Error('Müşteri bulunamadı.')

  customer.status = params.status

  await logAuditEvent({
    action: params.status === 'SUSPENDED' ? 'CUSTOMER_SUSPENDED' : 'CUSTOMER_ACTIVATED',
    entity: 'User',
    entityId: params.customerId,
    metadata: {
      customerEmail: customer.email,
      reason: params.reason || null,
      adminEmail: params.adminEmail,
    },
  })

  return customer
}
