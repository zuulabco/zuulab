import { NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/services/auth.service'
import { getOrderByNumber } from '@/lib/services/orders.service'
import { getInvoiceByOrderNumber } from '@/lib/services/invoice/invoice.service'

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
    const order = await getOrderByNumber(orderNumber, undefined, true)
    if (!order) {
      return NextResponse.json(
        { success: false, error: 'Sipariş bulunamadı.' },
        { status: 404 }
      )
    }

    // Customer ownership verification
    if (order.userId !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Bu siparişe erişim yetkiniz bulunmamaktadır.' },
        { status: 403 }
      )
    }

    const invoice = await getInvoiceByOrderNumber(orderNumber)

    if (!invoice) {
      return NextResponse.json({
        success: true,
        hasInvoice: false,
        invoice: null,
      })
    }

    // Return sanitized information for the customer (0 technical internals, 0 credentials)
    return NextResponse.json({
      success: true,
      hasInvoice: true,
      invoice: {
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        invoiceType: invoice.invoiceType,
        status: invoice.status,
        totalAmount: invoice.totalAmount,
        currency: invoice.currency,
        documentUrl:
          invoice.status === 'ISSUED'
            ? `/api/orders/${orderNumber}/invoice/document`
            : null,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: 'Fatura bilgisi alınamadı.' },
      { status: 500 }
    )
  }
}
