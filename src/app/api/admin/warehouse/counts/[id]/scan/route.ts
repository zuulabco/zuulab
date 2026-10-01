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

    if (!body.barcodeOrSku) {
      return NextResponse.json(
        { success: false, error: 'Barkod veya SKU belirtilmelidir.' },
        { status: 400 }
      )
    }

    if (body.countedQuantity === undefined || body.countedQuantity === null) {
      return NextResponse.json(
        { success: false, error: 'Sayılan miktar (countedQuantity) belirtilmelidir.' },
        { status: 400 }
      )
    }

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

    // If session is in blindMode and user is not admin/manager, mask expected and variance
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
      ticketCreated: !!result.ticket,
      ticket: canManage ? result.ticket : undefined,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Sayım kaydı işlenemedi.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}
