import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { adminAdjustStock } from '@/lib/services/inventory-admin.service'

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'INVENTORY_UPDATE')
    const body = await request.json().catch(() => ({}))
    const { productId, quantityChange, movementType, reason } = body

    if (!productId || quantityChange === undefined || !movementType || !reason) {
      return NextResponse.json(
        { success: false, error: 'Ürün ID, miktar değişimi, işlem türü ve gerekçe zorunludur.' },
        { status: 400 }
      )
    }

    const result = await adminAdjustStock({
      productId,
      quantityChange: Number(quantityChange),
      movementType,
      reason,
      changedBy: user.email,
    })

    return NextResponse.json({
      message: 'Stok başarıyla güncellendi.',
      ...result,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : error.isValidation ? 400 : 500 }
    )
  }
}
