import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import {
  getMarketplaceStores,
  createMarketplaceStore,
  type CreateStoreInput,
} from '@/lib/services/marketplace/marketplace.service'

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const stores = await getMarketplaceStores()

    return NextResponse.json({
      success: true,
      stores,
    })
  } catch (error: any) {
    const isForbidden =
      error.message?.includes('FORBIDDEN') ||
      error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Pazaryeri mağazaları listelenemedi.',
      },
      { status: isForbidden ? 403 : 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdmin(request)
    const body = (await request.json()) as CreateStoreInput

    if (!body.provider || !body.name || !body.externalMerchantId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Sağlayıcı (provider), Mağaza Adı (name) ve Satıcı ID zorunludur.',
        },
        { status: 400 }
      )
    }

    const store = await createMarketplaceStore(body, user.id)

    return NextResponse.json({
      success: true,
      store,
    })
  } catch (error: any) {
    const isForbidden =
      error.message?.includes('FORBIDDEN') ||
      error.message?.includes('UNAUTHORIZED')
    const isValidation = error.code === 'VALIDATION_ERROR'
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Pazaryeri mağazası oluşturulamadı.',
      },
      { status: isForbidden ? 403 : isValidation ? 400 : 500 }
    )
  }
}
