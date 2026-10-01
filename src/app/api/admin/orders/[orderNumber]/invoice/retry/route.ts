import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { retryInvoiceForOrder } from '@/lib/services/invoice/invoice.service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  try {
    const admin = await requireAdmin(request)
    const { orderNumber } = await params

    const invoice = await retryInvoiceForOrder({
      orderNumber,
      requestedBy: admin.email,
    })

    return NextResponse.json({
      success: true,
      message: 'Fatura oluşturma işlemi tekrar denendi.',
      invoice,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Tekrar deneme başarısız.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}
