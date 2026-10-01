import { NextResponse } from 'next/server'
import { verifyAuthToken } from '@/lib/firebase-admin'
import { syncOrCreateUser, extractBearerToken } from '@/lib/services/auth.service'

export async function POST(request: Request) {
  try {
    const token = extractBearerToken(request)
    const body = await request.json().catch(() => ({}))
    const clientToken = token || body.token

    if (!clientToken) {
      return NextResponse.json(
        { success: false, error: 'Yetkilendirme belirteci (token) eksik.' },
        { status: 401 }
      )
    }

    // Verify token authoritatively with Firebase Admin
    const decoded = await verifyAuthToken(clientToken)
    if (!decoded || !decoded.uid) {
      return NextResponse.json(
        { success: false, error: 'Geçersiz veya süresi dolmuş belirteç.' },
        { status: 401 }
      )
    }

    // Sync or create user in database
    const user = await syncOrCreateUser({
      firebaseUid: decoded.uid,
      email: decoded.email || body.email || `${decoded.uid}@zuulab.user`,
      name: (decoded.name as string) || body.name || null,
      avatar: (decoded.picture as string) || body.avatar || null,
      roleOverride: (decoded.role as any) || undefined,
    })

    return NextResponse.json({
      success: true,
      user,
    })
  } catch (error: any) {
    console.error('Auth sync error:', error)
    return NextResponse.json(
      { success: false, error: 'Kullanıcı senkronizasyonu sırasında hata oluştu.' },
      { status: 500 }
    )
  }
}
