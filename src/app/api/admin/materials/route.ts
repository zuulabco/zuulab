import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { MaterialService } from '@/lib/services/material.service'

export async function GET(request: Request) {
  try {
    const user = await requirePermission(request, 'MATERIAL_VIEW')
    // Authoritative server-side store context
    const storeId = user.storeId || null
    const materials = await MaterialService.getMaterialStocks(storeId)

    return NextResponse.json({
      success: true,
      materials,
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

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'MATERIAL_MANAGE')
    const body = await request.json()

    const result = await MaterialService.createMaterialStock(body, user)
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 422 })
    }

    return NextResponse.json({ success: true, stock: result.stock }, { status: 201 })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : isAuth ? 401 : 500 }
    )
  }
}
