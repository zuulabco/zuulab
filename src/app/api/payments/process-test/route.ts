import { NextResponse } from 'next/server'
import { processTestPayment } from '@/lib/services/payment/payment.service'

// Local-development payment simulator. It confirms orders without a real payment,
// so it must not exist in production or Vercel preview builds (NODE_ENV=production).
export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const { orderNumber, paymentId, simulateStatus, failureReason } = body

    if (!orderNumber) {
      return NextResponse.json(
        { success: false, error: 'Sipariş numarası (orderNumber) gereklidir.' },
        { status: 400 }
      )
    }

    const result = await processTestPayment({
      orderNumber,
      paymentId,
      simulateStatus: simulateStatus === 'FAILED' ? 'FAILED' : 'SUCCESS',
      failureReason,
    })

    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Ödeme simülasyonu başarısız.' },
      { status: 400 }
    )
  }
}
