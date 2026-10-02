import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import {
  getTicketDetails,
  addMessageToTicket,
  updateTicketStatus,
  type TicketStatusType,
} from '@/lib/services/support.service'
import { z } from 'zod'

const adminReplySchema = z.object({
  body: z.string().min(1, 'Mesaj boş olamaz.').max(2000),
  isInternal: z.boolean().default(false),
})

const updateStatusSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.number().int().min(1).max(3).optional(),
})

interface RouteProps {
  params: Promise<{ id: string }>
}

export async function GET(request: Request, { params }: RouteProps) {
  try {
    const adminUser = await requireAdmin(request)
    const { id } = await params

    const ticket = await getTicketDetails(id, adminUser)

    return NextResponse.json({
      success: true,
      ticket,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN') || error.message?.includes('UNAUTHORIZED')
    const isNotFound = error.message?.includes('NOT_FOUND')

    return NextResponse.json(
      { success: false, error: error.message || 'Destek talebi alınamadı.' },
      { status: isForbidden ? 403 : isNotFound ? 404 : 500 }
    )
  }
}

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const adminUser = await requireAdmin(request)
    const { id } = await params
    const body = await request.json().catch(() => ({}))

    const parsed = adminReplySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Geçersiz mesaj.' },
        { status: 400 }
      )
    }

    const message = await addMessageToTicket(
      id,
      adminUser,
      parsed.data.body,
      parsed.data.isInternal
    )

    return NextResponse.json({
      success: true,
      message,
    }, { status: 201 })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN') || error.message?.includes('UNAUTHORIZED')
    const isNotFound = error.message?.includes('NOT_FOUND')

    return NextResponse.json(
      { success: false, error: error.message || 'Yanıt gönderilemedi.' },
      { status: isForbidden ? 403 : isNotFound ? 404 : 500 }
    )
  }
}

export async function PATCH(request: Request, { params }: RouteProps) {
  try {
    const adminUser = await requireAdmin(request)
    const { id } = await params
    const body = await request.json().catch(() => ({}))

    const parsed = updateStatusSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Geçersiz durum güncellemesi.' },
        { status: 400 }
      )
    }

    const updated = await updateTicketStatus(id, adminUser, {
      status: parsed.data.status as TicketStatusType,
      priority: parsed.data.priority,
    })

    return NextResponse.json({
      success: true,
      message: 'Destek talebi güncellendi.',
      ticket: updated,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN') || error.message?.includes('UNAUTHORIZED')
    const isNotFound = error.message?.includes('NOT_FOUND')

    return NextResponse.json(
      { success: false, error: error.message || 'Güncelleme başarısız.' },
      { status: isForbidden ? 403 : isNotFound ? 404 : 500 }
    )
  }
}
