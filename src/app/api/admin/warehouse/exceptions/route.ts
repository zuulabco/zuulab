import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { WarehouseExceptionService } from '@/lib/services/warehouse/exception.service'

export async function GET(request: Request) {
  try {
    await requirePermission(request, 'WAREHOUSE_VIEW')
    const { searchParams } = new URL(request.url)

    const fulfillmentId = searchParams.get('fulfillmentId') || undefined
    const status = searchParams.get('status') as any
    const type = searchParams.get('type') as any

    const exceptions = await WarehouseExceptionService.listExceptions({
      fulfillmentId,
      status,
      type,
    })

    return NextResponse.json({
      success: true,
      count: exceptions.length,
      exceptions,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'İstisnalar listelenemedi.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission(request, 'WAREHOUSE_EXCEPTION')
    const body = await request.json()

    if (!body.fulfillmentId || !body.type || !body.description) {
      return NextResponse.json(
        {
          success: false,
          error: 'Eksik bilgi: fulfillmentId, type ve description gereklidir.',
        },
        { status: 400 }
      )
    }

    const exception = await WarehouseExceptionService.createException({
      fulfillmentId: body.fulfillmentId,
      fulfillmentItemId: body.fulfillmentItemId || null,
      type: body.type,
      severity: body.severity || 'MEDIUM',
      description: body.description,
      createdBy: user.name || user.email || 'Admin',
    })

    return NextResponse.json({
      success: true,
      exception,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'İstisna kaydı oluşturulamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : error.statusCode || 400 }
    )
  }
}
