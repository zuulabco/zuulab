import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/services/auth.service'
import { db, isDatabaseConfigured } from '@/prisma/db'

export async function GET(request: Request) {
  try {
    const user = await requireAuth(request)

    let addresses: any[] = []
    if (isDatabaseConfigured) {
      try {
        addresses = await db.orm.public.Address.where({ userId: user.id }).all()
      } catch (err) {
        console.warn('[account/profile] Could not fetch DB addresses:', err)
      }
    }

    return NextResponse.json({
      success: true,
      profile: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        role: user.role,
        status: user.status,
      },
      addresses,
    })
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Profil bilgisi alınamadı.' },
      { status: isAuth ? 401 : 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireAuth(request)
    const body = await request.json().catch(() => ({}))
    const { name } = body

    if (isDatabaseConfigured) {
      try {
        await db.orm.public.User.where({ id: user.id }).update({
          name: name || user.name,
        })
      } catch (err) {
        console.warn('[account/profile] Could not update DB user:', err)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Profil güncellendi.',
      profile: {
        ...user,
        name: name || user.name,
      },
    })
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    return NextResponse.json(
      { success: false, error: error.message || 'Profil güncellenemedi.' },
      { status: isAuth ? 401 : 500 }
    )
  }
}
