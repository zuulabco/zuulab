import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/services/auth.service'
import { getAuditLogs } from '@/lib/services/admin.service'

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const logs = await getAuditLogs(50)

    return NextResponse.json({
      success: true,
      logs,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Denetim kayıtları alınamadı.' },
      { status: isForbidden ? 403 : isAuth ? 401 : 500 }
    )
  }
}
