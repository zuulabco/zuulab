import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { adminGetCustomers } from '@/lib/services/customers-admin.service'

export async function GET(request: Request) {
  try {
    await requirePermission(request, 'CUSTOMER_VIEW')

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || undefined
    const status = searchParams.get('status') || undefined

    const customers = await adminGetCustomers({ search, status })

    return NextResponse.json({
      success: true,
      total: customers.length,
      customers,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
