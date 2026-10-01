import { NextResponse } from 'next/server'
import { processIncomingWebhook } from '@/lib/services/marketplace/ingestion.service'
import type { MarketplaceProviderType } from '@/lib/services/marketplace/marketplace.interface'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string; storeId: string }> }
) {
  try {
    const { provider, storeId } = await params
    const providerUpper = provider.toUpperCase() as MarketplaceProviderType

    if (providerUpper !== 'HEPSIBURADA' && providerUpper !== 'TRENDYOL') {
      return NextResponse.json(
        { success: false, error: `Geçersiz pazaryeri sağlayıcısı: ${provider}` },
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Geçersiz veya boş webhook gövdesi.' },
        { status: 400 }
      )
    }

    const result = await processIncomingWebhook(
      providerUpper,
      storeId,
      request.headers,
      body
    )

    return NextResponse.json(result)
  } catch (error: any) {
    const isAuth = error.code === 'AUTHENTICATION_ERROR' || error.statusCode === 401
    const isNotFound = error.code === 'NOT_FOUND' || error.statusCode === 404

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Webhook işlenirken hata oluştu.',
      },
      {
        status: isAuth ? 401 : isNotFound ? 404 : 500,
      }
    )
  }
}
