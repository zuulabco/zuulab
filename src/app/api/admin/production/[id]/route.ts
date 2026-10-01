import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { getProductionOrderById } from '@/lib/services/production.service'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission(request, 'PRODUCTION_VIEW')
    const { id } = await params
    const order = await getProductionOrderById(id)
    if (!order) {
      return NextResponse.json({ success: false, error: 'Uretim emri bulunamadi.' }, { status: 404 })
    }
    return NextResponse.json({ success: true, order })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json({ success: false, error: error.message }, { status: isForbidden ? 403 : isAuth ? 401 : 500 })
  }
}