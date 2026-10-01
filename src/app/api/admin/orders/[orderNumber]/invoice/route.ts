import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import {
  createInvoiceForOrder,
  getInvoiceByOrderNumber,
  syncInvoiceStatus,
} from '@/lib/services/invoice/invoice.service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  try {
    const admin = await requireAdmin(request)
    const { orderNumber } = await params

    const invoice = await createInvoiceForOrder({
      orderNumber,
      requestedBy: admin.email,
    })

    return NextResponse.json({
      success: true,
      message: 'Fatura başarıyla oluşturuldu.',
      invoice,
    })
  } catch (error: any) {
    console.error('[admin/orders/invoice] Error:', error)
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Fatura oluşturulamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  try {
    await requireAdmin(request)
    const { orderNumber } = await params

    const invoice = await getInvoiceByOrderNumber(orderNumber)

    return NextResponse.json({
      success: true,
      invoice: invoice || null,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Fatura bilgisi alınamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 500 }
    )
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  try {
    await requireAdmin(request)
    const { orderNumber } = await params

    const invoice = await syncInvoiceStatus(orderNumber)

    return NextResponse.json({
      success: true,
      message: 'Fatura durumu Uyumsoft ile senkronize edildi.',
      invoice,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Durum güncellenemedi.' },
      { status: 400 }
    )
  }
}
