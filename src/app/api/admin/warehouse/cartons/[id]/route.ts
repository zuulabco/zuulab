import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { CartonizationService } from '@/lib/services/warehouse/cartonization.service'

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission(request, 'WAREHOUSE_VIEW')
    const { id } = await props.params

    const carton = await CartonizationService.getCarton(id)
    if (!carton) {
      return NextResponse.json(
        { success: false, error: 'Koli tanımı bulunamadı.' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      carton,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Koli tanımı alınamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 500 }
    )
  }
}

export async function PUT(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(request, 'WAREHOUSE_CARTON_MANAGE')
    const { id } = await props.params
    const body = await request.json()

    const carton = await CartonizationService.updateCarton(
      id,
      body,
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
      { success: false, error: error.message || 'Koli tanımı güncellenemedi.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission(request, 'WAREHOUSE_CARTON_MANAGE')
    const { id } = await props.params

    await CartonizationService.deleteCarton(id, user.name || user.email || 'Admin')

    return NextResponse.json({
      success: true,
      message: 'Koli tanımı silindi.',
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Koli tanımı silinemedi.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}
