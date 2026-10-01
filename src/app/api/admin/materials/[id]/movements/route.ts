import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { MaterialService } from '@/lib/services/material.service'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(request, 'MATERIAL_VIEW')
    const { id } = await params
    const storeId = user.storeId || null

    const stock = await MaterialService.getMaterialStockById(id, storeId)
    if (!stock) {
      return NextResponse.json(
        { success: false, error: 'Malzeme stoğu bulunamadı veya erişim yetkiniz yok.' },
        { status: 404 }
      )
    }

    const movements = await MaterialService.getMaterialMovements(id, storeId)

    return NextResponse.json({
      success: true,
      stock,
      movements,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : isAuth ? 401 : 500 }
    )
  }
}
