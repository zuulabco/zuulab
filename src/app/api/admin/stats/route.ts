import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { getAdminOverview } from '@/lib/services/admin.service'

export async function GET(request: Request) {
  try {
    const adminUser = await requireAdmin(request)
    const stats = await getAdminOverview()

    return NextResponse.json({
      success: true,
      user: {
        id: adminUser.id,
        email: adminUser.email,
        role: adminUser.role,
      },
      stats,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Yönetici istatistikleri alınamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 500 }
    )
  }
}
