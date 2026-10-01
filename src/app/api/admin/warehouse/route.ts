import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { WarehouseService } from '@/lib/services/warehouse/warehouse.service'
import type { WarehouseFulfillmentStatus } from '@/lib/services/warehouse/warehouse-types'

export async function GET(request: Request) {
  try {
    await requirePermission(request, 'WAREHOUSE_VIEW')
    const { searchParams } = new URL(request.url)

    const channel = searchParams.get('channel') || undefined
    const storeId = searchParams.get('storeId') || undefined
    const status = (searchParams.get('status') || undefined) as
      | WarehouseFulfillmentStatus
      | undefined
    const orderNumber = searchParams.get('orderNumber') || undefined
    const sku = searchParams.get('sku') || undefined

    const fulfillments = await WarehouseService.listFulfillments({
      channel,
      storeId,
      status,
      orderNumber,
      sku,
    })

    // Calculate KPIs across all fulfillments
    const all = await WarehouseService.listFulfillments()
    const kpis = {
      readyToPick: all.filter((f) => f.status === 'READY_TO_PICK').length,
      picking: all.filter((f) => f.status === 'PICKING').length,
      picked: all.filter((f) => f.status === 'PICKED').length,
      packing: all.filter((f) => f.status === 'PACKING').length,
      packed: all.filter((f) => f.status === 'PACKED').length,
      readyForHandover: all.filter((f) => f.status === 'READY_FOR_HANDOVER').length,
      handedOver: all.filter((f) => f.status === 'HANDED_OVER').length,
      blocked: all.filter((f) => f.status === 'BLOCKED').length,
      total: all.length,
    }

    return NextResponse.json({
      success: true,
      kpis,
      count: fulfillments.length,
      fulfillments,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Depo verileri alınamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 500 }
    )
  }
}
