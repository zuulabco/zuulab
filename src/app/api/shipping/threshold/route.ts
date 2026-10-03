import { NextResponse } from 'next/server'
import { getStoreSettings } from '@/lib/services/settings/store-settings.service'
import { shippingMethodFromSettings } from '@/lib/services/shipping.service'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const settings = await getStoreSettings()
    return NextResponse.json(
      {
        success: true,
        freeShippingThreshold: settings.freeShippingThreshold,
        method: shippingMethodFromSettings(settings.shipping),
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        },
      }
    )
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Kargo eşiği alınamadı.' },
      { status: 500 }
    )
  }
}
