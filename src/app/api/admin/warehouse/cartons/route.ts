import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { CartonizationService } from '@/lib/services/warehouse/cartonization.service'

export async function GET(request: Request) {
  try {
    await requirePermission(request, 'WAREHOUSE_VIEW')
    const { searchParams } = new URL(request.url)

    const activeOnly = searchParams.get('activeOnly') !== 'false'
    const storeId = searchParams.get('storeId') || undefined

    const cartons = await CartonizationService.listCartons({
      activeOnly,
      storeId,
    })

    return NextResponse.json({
      success: true,
      count: cartons.length,
      cartons,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Koli tanımları alınamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'WAREHOUSE_CARTON_MANAGE')
    const body = await request.json()

    const carton = await CartonizationService.createCarton(
      {
        storeId: body.storeId || null,
        code: body.code,
        name: body.name,
        innerLengthMm: Number(body.innerLengthMm),
        innerWidthMm: Number(body.innerWidthMm),
        innerHeightMm: Number(body.innerHeightMm),
        maxWeightGrams: Number(body.maxWeightGrams),
        tareWeightGrams: Number(body.tareWeightGrams || 0),
        active: body.active !== undefined ? body.active : true,
        priority: Number(body.priority || 10),
      },
      user.name || user.email || 'Admin'
    )

    return NextResponse.json({
      success: true,
      carton,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Koli tanımı oluşturulamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}
