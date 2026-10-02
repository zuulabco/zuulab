import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { createProductionOrder, getProductionOrders } from '@/lib/services/production.service'
import { MaterialService } from '@/lib/services/material.service'

export async function GET(request: Request) {
  try {
    await requirePermission(request, 'PRODUCTION_VIEW')
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') as any
    const orders = await getProductionOrders(status ? { status } : undefined)
    // Jobs whose filament will not be enough (open jobs, oldest first take what is left).
    const { shortJobs } = await MaterialService.getMaterialReadiness()
    const short = new Map(shortJobs.map((j) => [j.productionOrderId, j.missingGrams]))
    return NextResponse.json({
      success: true,
      orders: orders.map((o) => ({ ...o, materialMissingGrams: short.get(o.id) ?? 0 })),
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json({ success: false, error: error.message }, { status: isForbidden ? 403 : isAuth ? 401 : 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'PRODUCTION_MANAGE')
    const body = await request.json()
    const { productId, quantity, priority, printerReference, notes, materialStockId, gramsPerUnit } = body
    if (!productId || !quantity) {
      return NextResponse.json({ success: false, error: 'productId ve quantity zorunludur.' }, { status: 400 })
    }
    const result = await createProductionOrder({
      productId,
      quantity: Number(quantity),
      priority: priority || 'NORMAL',
      printerReference: printerReference || undefined,
      notes: notes || undefined,
      materialStockId: materialStockId === undefined ? undefined : materialStockId || null,
      gramsPerUnit: gramsPerUnit === undefined || gramsPerUnit === '' ? undefined : gramsPerUnit === null ? null : Number(gramsPerUnit),
      createdBy: user.id,
    })
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 422 })
    }
    return NextResponse.json({ success: true, order: result.order }, { status: 201 })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json({ success: false, error: error.message }, { status: isForbidden ? 403 : isAuth ? 401 : 500 })
  }
}
