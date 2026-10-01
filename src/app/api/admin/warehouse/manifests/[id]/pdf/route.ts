import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { ManifestService } from '@/lib/services/warehouse/manifest.service'

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission(request, 'WAREHOUSE_VIEW')
    const params = await props.params

    const result = await ManifestService.generateManifestPdf(params.id)

    const pdfBuffer = Buffer.from(result.pdfBase64, 'base64')
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="manifesto-${result.manifestNumber}.pdf"`,
        'X-Document-Checksum': result.checksum,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Manifesto PDF belgesi üretilemedi.' },
      { status: isForbidden ? 403 : isAuth ? 401 : error.statusCode || 500 }
    )
  }
}
