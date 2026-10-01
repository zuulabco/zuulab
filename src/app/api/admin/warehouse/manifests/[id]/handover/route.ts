import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { ManifestService } from '@/lib/services/warehouse/manifest.service'

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(request, 'WAREHOUSE_MANIFEST')
    const params = await props.params
    let body: any = {}
    try {
      body = await request.json()
    } catch {}

    const manifest = await ManifestService.confirmHandover({
      manifestId: params.id,
      operatorId: user.id || 'op_current',
      carrierOperatorName: body.carrierOperatorName || undefined,
      notes: body.notes || undefined,
    })

    return NextResponse.json({
      success: true,
      manifest,
      message: 'Kargo teslimatı (handover) başarıyla onaylandı ve stok çıkışları tamamlandı.',
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Kargo teslimatı onaylanamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : error.statusCode || 400 }
    )
  }
}
