import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { getAllInvoices } from '@/lib/services/invoice/invoice.service'

export async function GET(request: Request) {
  try {
    await requireAdmin(request)

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || undefined
    const invoiceType = searchParams.get('type') || undefined
    const search = searchParams.get('search') || undefined
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 50

    const invoices = await getAllInvoices({
      status,
      invoiceType,
      search,
      limit,
    })

    return NextResponse.json({
      success: true,
      total: invoices.length,
      invoices,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Faturalar alınamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 500 }
    )
  }
}
