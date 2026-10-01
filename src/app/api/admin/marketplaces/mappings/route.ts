import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import {
  getMarketplaceMappings,
  createProductMapping,
  type CreateMappingInput,
} from '@/lib/services/marketplace/marketplace.service'

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const { searchParams } = new URL(request.url)
    const storeId = searchParams.get('storeId') || undefined

    const mappings = await getMarketplaceMappings(storeId)

    return NextResponse.json({
      success: true,
      mappings,
    })
  } catch (error: any) {
    const isForbidden =
      error.message?.includes('FORBIDDEN') ||
      error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Ürün eşleştirmeleri listelenemedi.',
      },
      { status: isForbidden ? 403 : 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdmin(request)
    const body = (await request.json()) as CreateMappingInput

    if (!body.storeId || !body.productId || !body.externalSku) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Mağaza ID, ZUULAB Ürün ID ve Harici SKU (externalSku) zorunludur.',
        },
        { status: 400 }
      )
    }

    const mapping = await createProductMapping(body, user.id)

    return NextResponse.json({
      success: true,
      mapping,
    })
  } catch (error: any) {
    const isForbidden =
      error.message?.includes('FORBIDDEN') ||
      error.message?.includes('UNAUTHORIZED')
    const isValidation = error.code === 'VALIDATION_ERROR'
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Ürün eşleştirmesi oluşturulamadı.',
      },
      { status: isForbidden ? 403 : isValidation ? 400 : 500 }
    )
  }
}
