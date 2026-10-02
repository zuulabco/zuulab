import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { MaterialService } from '@/lib/services/material.service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(request, 'MATERIAL_MANAGE')
    const { id } = await params
    const body = await request.json()

    const { deltaGrams, reason, reference, idempotencyKey, type } = body

    if (deltaGrams === undefined || deltaGrams === null || isNaN(Number(deltaGrams))) {
      return NextResponse.json(
        { success: false, error: 'deltaGrams zorunludur ve sayısal bir değer olmalıdır.' },
        { status: 400 }
      )
    }

    if (!reason || typeof reason !== 'string' || reason.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Düzeltme gerekçesi (reason) zorunludur.' },
        { status: 400 }
      )
    }

    const result = await MaterialService.adjustMaterialStock(
      id,
      {
        deltaGrams: Number(deltaGrams),
        reason: reason.trim(),
        reference,
        idempotencyKey,
        type,
      },
      user
    )

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 422 })
    }

    return NextResponse.json({
      success: true,
      stock: result.stock,
      isIdempotentRepeat: result.idempotent || false,
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
