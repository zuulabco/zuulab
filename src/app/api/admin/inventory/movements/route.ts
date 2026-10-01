import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { adminGetInventoryMovements } from '@/lib/services/inventory-admin.service'

export async function GET(request: Request) {
  try {
    await requirePermission(request, 'INVENTORY_VIEW')
    const { searchParams } = new URL(request.url)
    const productId = searchParams.get('productId') || undefined

    const movements = await adminGetInventoryMovements(productId)

    return NextResponse.json({
      success: true,
      total: movements.length,
      movements,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
