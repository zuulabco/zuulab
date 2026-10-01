import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { retryNotification } from '@/lib/services/notification/notification.service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin(request)
    const { id } = await params

    const updated = await retryNotification({
      notificationId: id,
      requestedBy: admin.email,
      force: true, // Admin can explicitly force retry
    })

    return NextResponse.json({
      success: true,
      message: 'Bildirim gönderimi yeniden denendi.',
      notification: updated,
    })
  } catch (error: any) {
    console.error('[admin/notifications/retry] Error:', error)
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Yeniden deneme başarısız oldu.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 400 }
    )
  }
}
