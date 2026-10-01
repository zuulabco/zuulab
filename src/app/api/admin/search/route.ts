import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/services/auth.service'
import { getAllOrders } from '@/lib/services/orders.service'
import { adminGetProducts } from '@/lib/services/catalog-admin.service'
import { adminGetCustomers } from '@/lib/services/customers-admin.service'

export async function GET(request: Request) {
  try {
    const user = await requireAuth(request)
    if (user.role === 'CUSTOMER') {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const q = (searchParams.get('q') || '').trim().toLowerCase()

    if (!q || q.length < 2) {
      return NextResponse.json({
        success: true,
        orders: [],
        products: [],
        customers: [],
      })
    }

    const [allOrders, productsRes, allCustomers] = await Promise.all([
      getAllOrders({ search: q, limit: 5 }),
      adminGetProducts({ search: q, limit: 5 }),
      adminGetCustomers({ search: q }),
    ])

    return NextResponse.json({
      success: true,
      orders: allOrders.slice(0, 5).map((o) => ({
        orderNumber: o.orderNumber,
        customerName: o.shippingAddressSnapshot.fullName,
        total: o.totalAmount,
        status: o.status,
      })),
      products: productsRes.items.slice(0, 5).map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        price: p.price,
        stock: p.stock,
      })),
      customers: allCustomers.slice(0, 5).map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        orderCount: c.orderCount,
      })),
    })
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isAuth ? 401 : 500 }
    )
  }
}
