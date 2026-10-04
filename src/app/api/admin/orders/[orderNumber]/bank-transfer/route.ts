import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { confirmBankTransfer } from '@/lib/services/payment/payment.service'

interface Context {
  params: Promise<{ orderNumber: string }>
}

/**
 * The shop confirms that a havale/EFT order's money arrived. The order is then
 * confirmed exactly like a card payment (stock, coupon, customer and shop mails).
 */
export async function POST(request: Request, { params }: Context) {
  try {
    const user = await requirePermission(request, 'ORDER_UPDATE')
    const { orderNumber } = await params
    const result = await confirmBankTransfer({ orderNumber, confirmedBy: user.email })
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.message }, { status: 409 })
    }
    return NextResponse.json({ success: true, message: 'Havale ödemesi onaylandı; sipariş onaylandı ve müşteriye e-posta gönderildi.' })
  } catch (err) {
    const error = err as Error
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json({ success: false, error: error.message }, { status: isForbidden ? 403 : 400 })
  }
}
