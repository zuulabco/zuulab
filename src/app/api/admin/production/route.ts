import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { createProductionOrder, getProductionOrders } from '@/lib/services/production.service'
import { MaterialService } from '@/lib/services/material.service'

export async function GET(request: Request) {
  try {
    const user = await requirePermission(request, 'PRODUCTION_VIEW')
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') as any
    const orders = await getProductionOrders(status ? { status } : undefined)
    const enrichedOrders = await Promise.all(
      orders.map(async (o) => {
        const readiness = await MaterialService.evaluateProductionOrderReadiness(o, user.storeId)
        return {
          ...o,
          materialReadiness: readiness,
        }
      })
    )
    return NextResponse.json({ success: true, orders: enrichedOrders })
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
    const { productId, quantity, priority, printerReference, notes } = body
    if (!productId || !quantity) {
      return NextResponse.json({ success: false, error: 'productId ve quantity zorunludur.' }, { status: 400 })
    }
    const result = await createProductionOrder({
      productId,
      quantity: Number(quantity),
      priority: priority || 'NORMAL',
      printerReference: printerReference || undefined,
      notes: notes || undefined,
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
