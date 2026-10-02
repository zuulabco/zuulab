import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { adminSetStockLevels } from '@/lib/services/inventory-admin.service'

/**
 * Sets counted stock levels for one or more products:
 * { items: [{ productId, stock, expectedStock? }], reason? }
 */
export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'INVENTORY_UPDATE')
    const body = (await request.json().catch(() => ({}))) as {
      items?: Array<{ productId?: unknown; stock?: unknown; expectedStock?: unknown }>
      reason?: unknown
    }
    const items = (Array.isArray(body.items) ? body.items : [])
      .filter((i) => typeof i?.productId === 'string')
      .slice(0, 500)
      .map((i) => ({
        productId: i.productId as string,
        stock: Number(i.stock),
        expectedStock: i.expectedStock === undefined || i.expectedStock === null ? undefined : Number(i.expectedStock),
      }))
    if (items.length === 0) {
      return NextResponse.json({ success: false, error: 'Güncellenecek ürün yok.' }, { status: 400 })
    }
    const results = await adminSetStockLevels({
      items,
      reason: typeof body.reason === 'string' ? body.reason : '',
      changedBy: user.email,
    })
    return NextResponse.json({ success: true, results })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stok güncellenemedi.'
    return NextResponse.json({ success: false, error: message }, { status: message.includes('FORBIDDEN') ? 403 : 500 })
  }
}
