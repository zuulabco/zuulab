import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { CarrierCutoffService } from '@/lib/services/warehouse/carrier-cutoff.service'
import { WarehouseService } from '@/lib/services/warehouse/warehouse.service'

export async function GET(request: Request) {
  try {
    await requirePermission(request, 'WAREHOUSE_VIEW')

    // Count pending fulfillments waiting for handover
    const fulfillments = await WarehouseService.listFulfillments({
      status: 'READY_FOR_HANDOVER',
    })

    const waitingCounts: Record<string, number> = {
      SURAT: 0,
      PTT: 0,
      YURTICI: 0,
      MOCK: 0,
    }

    for (const f of fulfillments) {
      // Default to SURAT or check provider
      waitingCounts.SURAT = (waitingCounts.SURAT || 0) + 1
    }

    const cutoffs = await CarrierCutoffService.getCarrierCutoffSummary(
      new Date(),
      waitingCounts
    )

    return NextResponse.json({
      success: true,
      cutoffs,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Kargo kesim saatleri alınamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    await requirePermission(request, 'WAREHOUSE_MANAGE')
    const body = await request.json()

    if (!body.carrierKey || !body.cutoffTime) {
      return NextResponse.json(
        { success: false, error: 'carrierKey ve cutoffTime zorunludur.' },
        { status: 400 }
      )
    }

    const updated = await CarrierCutoffService.setCarrierConfig(body.carrierKey, {
      cutoffTime: body.cutoffTime,
      pickupDays: body.pickupDays,
      normalThresholdMinutes: body.normalThresholdMinutes,
      approachingThresholdMinutes: body.approachingThresholdMinutes,
      isActive: body.isActive,
    })

    return NextResponse.json({
      success: true,
      config: updated,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Kargo kesim ayarı güncellenemedi.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}
