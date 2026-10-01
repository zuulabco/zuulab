import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { adminGetUsers } from '@/lib/services/users-admin.service'

export async function GET(request: Request) {
  try {
    await requirePermission(request, 'USER_VIEW')

    const { searchParams } = new URL(request.url)
    const role = searchParams.get('role') || undefined
    const status = searchParams.get('status') || undefined
    const search = searchParams.get('search') || undefined

    const users = await adminGetUsers({ role, status, search })

    return NextResponse.json({
      success: true,
      total: users.length,
      users,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
