import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { WavePickingService } from '@/lib/services/warehouse/wave-picking.service'

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission(request, 'WAREHOUSE_WAVE_VIEW')
    const { id } = await props.params

    const wave = await WavePickingService.getWave(id)

    return NextResponse.json({
      success: true,
      wave,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Dalga bulunamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 404 }
    )
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission(request, 'WAREHOUSE_WAVE_MANAGE')
    const { id } = await props.params
    const { searchParams } = new URL(request.url)
    const reason = searchParams.get('reason') || undefined

    const wave = await WavePickingService.cancelWave(id, reason)

    return NextResponse.json({
      success: true,
      wave,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Dalga iptal edilemedi.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}
