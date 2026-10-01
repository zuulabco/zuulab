import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { adminGetCustomerDetail } from '@/lib/services/customers-admin.service'

interface Context {
  params: Promise<{ id: string }>
}

export async function GET(request: Request, { params }: Context) {
  try {
    await requirePermission(request, 'CUSTOMER_VIEW')
    const { id } = await params

    const customer = await adminGetCustomerDetail(id)
    if (!customer) {
      return NextResponse.json({ success: false, error: 'Müşteri bulunamadı.' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      customer,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
