import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { adminUpdateCustomerStatus } from '@/lib/services/customers-admin.service'

interface Context {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, { params }: Context) {
  try {
    const user = await requirePermission(request, 'CUSTOMER_MANAGE')
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const { status, reason } = body

    if (!status || (status !== 'ACTIVE' && status !== 'SUSPENDED')) {
      return NextResponse.json(
        { success: false, error: "Geçerli bir durum ('ACTIVE' veya 'SUSPENDED') belirtilmelidir." },
        { status: 400 }
      )
    }

    const updated = await adminUpdateCustomerStatus({
      customerId: id,
      status,
      reason,
      adminEmail: user.email,
    })

    return NextResponse.json({
      success: true,
      message: `Müşteri hesabı '${status}' olarak güncellendi.`,
      customer: updated,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
