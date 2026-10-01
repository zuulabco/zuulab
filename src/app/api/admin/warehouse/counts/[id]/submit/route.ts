import { NextResponse } from 'next/server'
import { requirePermission, hasPermission } from '@/lib/services/permissions.service'
import { CycleCountingService } from '@/lib/services/warehouse/cycle-counting.service'

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(request, 'WAREHOUSE_COUNT_VIEW')
    const { id } = await props.params
    const body = await request.json()

    if (Array.isArray(body.items)) {
      // Bulk submit
      const results = []
      for (const item of body.items) {
        const res = await CycleCountingService.submitCountScan({
          sessionId: id,
          locationId: item.locationId,
          locationCode: item.locationCode,
          barcodeOrSku: item.barcodeOrSku || item.sku || item.barcode,
          countedQuantity: Number(item.countedQuantity),
          countedBy: user.name || user.email || 'Operator',
          notes: item.notes,
        })
        results.push(res.line)
      }
      return NextResponse.json({ success: true, count: results.length, lines: results })
    }

    // Single item submit
    const result = await CycleCountingService.submitCountScan({
      sessionId: id,
      locationId: body.locationId,
      locationCode: body.locationCode,
      barcodeOrSku: body.barcodeOrSku,
      countedQuantity: Number(body.countedQuantity),
      countedBy: user.name || user.email || 'Operator',
      notes: body.notes,
      idempotencyAttempt: body.idempotencyAttempt || 1,
    })

    const canManage = hasPermission(user.role, 'WAREHOUSE_COUNT_MANAGE')
    const safeLine =
      result.session.blindMode && !canManage
        ? {
            ...result.line,
            expectedQuantity: -1,
            varianceQuantity: null,
          }
        : result.line

    return NextResponse.json({
      success: true,
      line: safeLine,
      idempotent: result.idempotent,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Sayım kaydı tamamlanamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}
