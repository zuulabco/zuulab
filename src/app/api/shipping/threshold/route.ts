import { NextResponse } from 'next/server'
import { getFreeShippingThreshold } from '@/lib/services/settings/store-settings.service'

export async function GET() {
  try {
    const threshold = await getFreeShippingThreshold()
    return NextResponse.json({
      success: true,
      freeShippingThreshold: threshold,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Kargo eşiği alınamadı.' },
      { status: 500 }
    )
  }
}
