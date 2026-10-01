import { NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/services/auth.service'
import { getInvoiceDocument } from '@/lib/services/invoice/invoice.service'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Oturum açmanız gerekmektedir.' },
        { status: 401 }
      )
    }

    const { orderNumber } = await params

    const doc = await getInvoiceDocument({
      orderNumber,
      userId: user.id,
      isAdmin: false,
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
    return NextResponse.json(
      { success: false, error: error.message || 'Fatura belgesi görüntülenemedi.' },
      { status: isForbidden ? 403 : 404 }
    )
  }
}
