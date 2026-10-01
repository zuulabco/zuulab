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

    const manifest = await ManifestService.closeManifest(params.id)

    return NextResponse.json({
      success: true,
      manifest,
      message: 'Manifesto kapatıldı ve kurye teslimine hazır hale getirildi.',
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Manifesto kapatılamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : error.statusCode || 400 }
    )
  }
}
