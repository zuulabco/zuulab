import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { CartonizationService } from '@/lib/services/warehouse/cartonization.service'
import { PackingService } from '@/lib/services/warehouse/packing.service'

export async function POST(request: Request) {
  try {
    await requirePermission(request, 'WAREHOUSE_VIEW')
    const body = await request.json()

    // 1. If fulfillmentId is supplied, preview through PackingService
    if (body.fulfillmentId) {
      const result = await PackingService.previewCartonRecommendation(
        body.fulfillmentId,
        { storeId: body.storeId }
      )
      return NextResponse.json({
        success: result.success,
        result,
      })
    }

    // 2. Direct items array supplied
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Önizleme için ürün listesi (items) veya fulfillmentId belirtilmelidir.',
        },
        { status: 400 }
      )
    }

    const result = CartonizationService.recommendCarton(body.items, {
      storeId: body.storeId || null,
      allowRotation: body.allowRotation,
    })

    return NextResponse.json({
      success: result.success,
      result,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Koli önerisi hesaplanamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}
