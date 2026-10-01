import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { MaterialService } from '@/lib/services/material.service'

export async function GET(request: Request) {
  try {
    const user = await requirePermission(request, 'MATERIAL_VIEW')
    const storeId = user.storeId || null
    const readiness = await MaterialService.getMaterialReadiness(storeId)

    return NextResponse.json({
      success: true,
      ...readiness,
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
