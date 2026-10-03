import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/services/auth.service'
import { getTicketDetails, addMessageToTicket } from '@/lib/services/support.service'
import { z } from 'zod'

const messageSchema = z.object({
  body: z.string().min(1, 'Mesaj boş olamaz.').max(2000),
})

interface RouteProps {
  params: Promise<{ id: string }>
}

export async function GET(request: Request, { params }: RouteProps) {
  try {
    const user = await requireAuth(request)
    const { id } = await params

    const ticket = await getTicketDetails(id, user)

    return NextResponse.json({
      success: true,
      ticket,
    })
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isNotFound = error.message?.includes('NOT_FOUND')

    return NextResponse.json(
      { success: false, error: error.message || 'Destek talebi alınamadı.' },
      { status: isAuth ? 401 : isForbidden ? 403 : isNotFound ? 404 : 500 }
    )
  }
}

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const user = await requireAuth(request)
    const { id } = await params
    const body = await request.json().catch(() => ({}))

    const parsed = messageSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Geçersiz mesaj.' },
        { status: 400 }
      )
    }

    const message = await addMessageToTicket(id, user, parsed.data.body, false)

    return NextResponse.json({
      success: true,
      message,
    }, { status: 201 })
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isNotFound = error.message?.includes('NOT_FOUND')
    const isClosed = error.message?.includes('TICKET_CLOSED')

    return NextResponse.json(
      { success: false, error: error.message || 'Mesaj gönderilemedi.' },
      { status: isAuth ? 401 : isForbidden ? 403 : isNotFound ? 404 : isClosed ? 409 : 500 }
    )
  }
}
