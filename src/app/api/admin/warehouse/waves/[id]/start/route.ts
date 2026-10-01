import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { WavePickingService } from '@/lib/services/warehouse/wave-picking.service'

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(request, 'WAREHOUSE_PICK')
    const { id } = await props.params

    const wave = await WavePickingService.startWave(
      id,
      user.name || user.email || 'operator_1'
    )

    return NextResponse.json({
      success: true,
      wave,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Dalga başlatılamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}
