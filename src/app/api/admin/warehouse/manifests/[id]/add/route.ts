import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { ManifestService } from '@/lib/services/warehouse/manifest.service'

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission(request, 'WAREHOUSE_MANIFEST')
    const params = await props.params
    const body = await request.json()

    if (!body.shipmentId) {
      return NextResponse.json(
        { success: false, error: 'Gönderi ID (shipmentId) gereklidir.' },
        { status: 400 }
      )
    }

    const manifest = await ManifestService.addShipmentToManifest(params.id, body.shipmentId)

    return NextResponse.json({
      success: true,
      manifest,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Gönderi manifestoya eklenemedi.' },
      { status: isForbidden ? 403 : isAuth ? 401 : error.statusCode || 400 }
    )
  }
}
