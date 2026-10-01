import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { getShipmentLabel } from '@/lib/services/shipping/fulfillment.service'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  try {
    await requireAdmin(request)
    const { orderNumber } = await params

    const labelResult = await getShipmentLabel({
      orderNumber,
      isAdmin: true,
    })

    if (labelResult.labelFormat === 'PDF') {
      const pdfBuffer = Buffer.from(labelResult.labelData, 'base64')
      return new NextResponse(pdfBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="kargo-etiketi-${orderNumber}.pdf"`,
          'Cache-Control': 'no-store, max-age=0',
        },
      })
    }

    return NextResponse.json({
      success: true,
      labelData: labelResult.labelData,
      labelFormat: labelResult.labelFormat,
    })
  } catch (error: any) {
    console.error('[admin/orders/shipping/label] Error:', error)
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Kargo etiketi alınamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 500 }
    )
  }
}
