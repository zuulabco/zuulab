import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import {
  adminGetUserById,
  adminUpdateUserRole,
  adminUpdateUserStatus,
} from '@/lib/services/users-admin.service'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission(request, 'USER_VIEW')
    const { id } = await params
    const user = await adminGetUserById(id)

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Kullanıcı bulunamadı.' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      user,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actorUser = await requirePermission(request, 'USER_MANAGE')
    const { id } = await params
    const body = await request.json().catch(() => ({}))

    if (body.role) {
      const updated = await adminUpdateUserRole({
        targetUserId: id,
        newRole: body.role,
        actorUser,
      })
      return NextResponse.json({
        success: true,
        message: 'Kullanıcı rolü başarıyla güncellendi.',
        user: updated,
      })
    }

    if (body.status) {
      const updated = await adminUpdateUserStatus({
        targetUserId: id,
        newStatus: body.status,
        actorUser,
      })
      return NextResponse.json({
        success: true,
        message: 'Kullanıcı durumu başarıyla güncellendi.',
        user: updated,
      })
    }

    return NextResponse.json(
      { success: false, error: 'Güncellenecek geçerli bir alan (role veya status) belirtilmedi.' },
      { status: 400 }
    )
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
