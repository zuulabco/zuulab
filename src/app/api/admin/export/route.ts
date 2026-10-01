import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { getAllOrders } from '@/lib/services/orders.service'
import { adminGetProducts } from '@/lib/services/catalog-admin.service'
import { adminGetCustomers } from '@/lib/services/customers-admin.service'
import { adminGetInventoryOverview } from '@/lib/services/inventory-admin.service'
import {
  generateOrdersCsv,
  generateProductsCsv,
  generateCustomersCsv,
  generateInventoryCsv,
} from '@/lib/services/export.service'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'orders'

    let csvContent = ''
    let filename = `zuulab-${type}-${new Date().toISOString().slice(0, 10)}.csv`

    if (type === 'orders') {
      await requirePermission(request, 'ORDER_VIEW')
      const orders = await getAllOrders()
      csvContent = generateOrdersCsv(orders)
    } else if (type === 'products') {
      await requirePermission(request, 'PRODUCT_VIEW')
      const productsRes = await adminGetProducts({ limit: 1000 })
      csvContent = generateProductsCsv(productsRes.items)
    } else if (type === 'customers') {
      await requirePermission(request, 'CUSTOMER_VIEW')
      const customers = await adminGetCustomers()
      csvContent = generateCustomersCsv(customers)
    } else if (type === 'inventory') {
      await requirePermission(request, 'INVENTORY_VIEW')
      const inventory = await adminGetInventoryOverview()
      csvContent = generateInventoryCsv(inventory)
    } else {
      return NextResponse.json({ success: false, error: 'Geçersiz dışa aktarım türü.' }, { status: 400 })
    }

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
