import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { adminGetInventoryOverview } from '@/lib/services/inventory-admin.service'

export async function GET(request: Request) {
  try {
    await requirePermission(request, 'INVENTORY_VIEW')
    const inventory = await adminGetInventoryOverview()

    return NextResponse.json({
      success: true,
      total: inventory.length,
      inventory,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
