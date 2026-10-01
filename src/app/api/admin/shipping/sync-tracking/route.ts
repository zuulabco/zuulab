import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { syncActiveShipmentsTracking } from '@/lib/services/shipping/fulfillment.service'

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    let isAuthorized = false

    // Check if called via Vercel Cron secret
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      isAuthorized = true
    } else {
      // Otherwise check admin session
      try {
        await requireAdmin(request)
        isAuthorized = true
      } catch {
        isAuthorized = false
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { success: false, error: 'UNAUTHORIZED: Yetkisiz cron/senkronizasyon isteği.' },
        { status: 401 }
      )
    }

    const result = await syncActiveShipmentsTracking()

    return NextResponse.json({
      success: true,
      message: `${result.syncedCount} kargo sorgulandı, ${result.updatedCount} durum güncellendi.`,
      result,
    })
  } catch (error: any) {
    console.error('[admin/shipping/sync-tracking] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Kargo senkronizasyonu başarısız oldu.' },
      { status: 500 }
    )
  }
}
