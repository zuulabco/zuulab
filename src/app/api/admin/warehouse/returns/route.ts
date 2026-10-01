import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { ReturnInspectionService } from '@/lib/services/warehouse/return-inspection.service'

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'WAREHOUSE_RETURN_VIEW')
    const body = await request.json()

    if (!body.barcode && !body.returnNumber) {
      return NextResponse.json(
        { success: false, error: 'Barkod veya iade/sipariş/kargo takip numarası zorunludur.' },
        { status: 400 }
      )
    }

    const code = (body.barcode || body.returnNumber).trim()

    // Scan package & start or get inspection
    const inspection = await ReturnInspectionService.startInspection({
      returnNumber: code,
      inspectedBy: user.name || user.email || 'Admin',
    })

    return NextResponse.json({
      success: true,
      inspection,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'İade paketi okutulamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}
