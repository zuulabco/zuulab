import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { getInvoiceDocument } from '@/lib/services/invoice/invoice.service'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  try {
    await requireAdmin(request)
    const { orderNumber } = await params

    const doc = await getInvoiceDocument({
      orderNumber,
      isAdmin: true,
    })

    const pdfBuffer = Buffer.from(doc.pdfData, 'base64')

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${doc.fileName}"`,
        'Cache-Control': 'private, no-cache',
      },
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Fatura belgesi görüntülenemedi.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 404 }
    )
  }
}
