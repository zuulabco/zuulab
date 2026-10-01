import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { getAllNotifications } from '@/lib/services/notification/notification.service'
import type {
  NotificationStatus,
  NotificationEventType,
} from '@/lib/services/notification/notification.interface'

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const { searchParams } = new URL(request.url)

    const status = searchParams.get('status') as NotificationStatus | null
    const type = searchParams.get('type') as NotificationEventType | null
    const recipient = searchParams.get('recipient') || undefined
    const search = searchParams.get('search') || undefined

    const notifications = await getAllNotifications({
      status: status || undefined,
      type: type || undefined,
      recipient,
      search,
    })

    return NextResponse.json({
      success: true,
      count: notifications.length,
      notifications,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Bildirimler alınamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 500 }
    )
  }
}
