import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { processPendingNotifications } from '@/lib/services/notification/notification.service'

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    let isAuthorized = false

    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      isAuthorized = true
    } else {
      try {
        await requireAdmin(request)
        isAuthorized = true
      } catch {
        isAuthorized = false
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { success: false, error: 'UNAUTHORIZED: Yetkisiz bildirim işleme isteği.' },
        { status: 401 }
      )
    }

    const result = await processPendingNotifications()

    return NextResponse.json({
      success: true,
      message: `${result.processedCount} bildirim işlendi (${result.successCount} başarılı, ${result.failedCount} başarısız).`,
      result,
    })
  } catch (error: any) {
    console.error('[admin/notifications/process] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Bildirim kuyruğu işlenemedi.' },
      { status: 500 }
    )
  }
}
