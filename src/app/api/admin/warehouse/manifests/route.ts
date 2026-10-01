import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { ManifestService } from '@/lib/services/warehouse/manifest.service'

export async function GET(request: Request) {
  try {
    await requirePermission(request, 'WAREHOUSE_VIEW')
    const { searchParams } = new URL(request.url)

    const provider = searchParams.get('provider') || undefined
    const status = searchParams.get('status') as any

    const manifests = await ManifestService.listManifests({ provider, status })

    return NextResponse.json({
      success: true,
      count: manifests.length,
      manifests,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Manifestolar listelenemedi.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'WAREHOUSE_MANIFEST')
    const body = await request.json()

    if (!body.provider) {
      return NextResponse.json(
        { success: false, error: 'Kargo sağlayıcısı (provider) seçilmelidir.' },
        { status: 400 }
      )
    }

    const manifest = await ManifestService.createManifest({
      provider: body.provider,
      storeId: body.storeId || null,
      createdBy: user.name || user.email || 'Admin',
      notes: body.notes || undefined,
    })

    return NextResponse.json({
      success: true,
      manifest,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Manifesto oluşturulamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : error.statusCode || 400 }
    )
  }
}
