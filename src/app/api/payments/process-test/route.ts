import { NextResponse } from 'next/server'
import { processTestPayment } from '@/lib/services/payment/payment.service'

export async function POST(request: Request) {
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
