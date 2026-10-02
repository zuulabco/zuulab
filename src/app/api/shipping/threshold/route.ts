import { NextResponse } from 'next/server'
import { getFreeShippingThreshold } from '@/lib/services/settings/store-settings.service'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const threshold = await getFreeShippingThreshold()
    return NextResponse.json(
      {
        success: true,
        freeShippingThreshold: threshold,
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
