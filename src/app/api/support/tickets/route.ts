import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/security/rate-limit-response'
import { requireAuth } from '@/lib/services/auth.service'
import { getCustomerTickets, createTicket, type TicketCategoryType } from '@/lib/services/support.service'
import { z } from 'zod'

const createTicketSchema = z.object({
  subject: z.string().min(3, 'Konu en az 3 karakter olmalıdır.').max(120),
  category: z.enum(['ORDER', 'SHIPPING', 'RETURN', 'PRODUCT', 'PAYMENT', 'GENERAL']),
  message: z.string().min(5, 'Mesajınız en az 5 karakter olmalıdır.').max(2000),
  orderId: z.string().optional().nullable(),
  priority: z.number().int().min(1).max(3).optional(),
})

export async function GET(request: Request) {
  try {
    const user = await requireAuth(request)
    const tickets = await getCustomerTickets(user.id)

    return NextResponse.json({
      success: true,
      tickets,
    })
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Destek talepleri alınamadı.' },
      { status: isAuth ? 401 : 500 }
    )
  }
}

export async function POST(request: Request) {
  const limited = await rateLimit(request, 'supportTicket')
  if (limited) return limited

  try {
    const user = await requireAuth(request)
    const body = await request.json().catch(() => ({}))

    const parsed = createTicketSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Geçersiz destek talebi verisi.' },
        { status: 400 }
      )
    }

    const ticket = await createTicket(user, {
      subject: parsed.data.subject,
      category: parsed.data.category as TicketCategoryType,
      message: parsed.data.message,
      orderId: parsed.data.orderId,
      // Priority is set by staff, not by the customer.
    })

    return NextResponse.json({
      success: true,
      message: 'Destek talebiniz oluşturuldu.',
      ticket,
    }, { status: 201 })
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message || 'Destek talebi oluşturulamadı.' },
      { status: isAuth ? 401 : isForbidden ? 403 : 400 }
    )
  }
}
