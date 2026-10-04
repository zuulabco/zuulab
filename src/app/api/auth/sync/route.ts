import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/security/rate-limit-response'
import { verifyAuthToken } from '@/lib/firebase-admin'
import { isSignInFromEarlierDay } from '@/lib/auth/daily-session'
import { syncOrCreateUser, extractBearerToken, AuthSyncError } from '@/lib/services/auth.service'
import {
  createSessionToken,
  getSessionCookieDomain,
  SESSION_COOKIE_NAME,
  sessionMaxAge,
} from '@/lib/services/session.service'

export async function POST(request: Request) {
  const limited = await rateLimit(request, 'authSync')
  if (limited) return limited

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
    // A sign-in from before today's midnight has ended: log in again
    if (isSignInFromEarlierDay((decoded.auth_time || 0) * 1000)) {
      return NextResponse.json(
        { success: false, error: 'Oturumunuz gece yarısı sona erdi. Lütfen tekrar giriş yapın.', code: 'SESSION_ENDED' },
        { status: 401 }
      )
    }

    // Identity fields come only from the verified token; a client-supplied email
    // would let any Firebase identity claim another user's record.
    const user = await syncOrCreateUser({
      firebaseUid: decoded.uid,
      email: decoded.email || `${decoded.uid}@zuulab.user`,
      emailVerified: decoded.email_verified === true,
      name: (decoded.name as string) || body.name || null,
      avatar: (decoded.picture as string) || body.avatar || null,
      roleOverride: (decoded.role as any) || undefined,
    })

    // Generate secure cross-subdomain session token
    const sessionToken = createSessionToken({
      userId: user.id,
      firebaseUid: user.firebaseUid,
      email: user.email,
      role: user.role,
      storeId: user.storeId || null,
    })

    const response = NextResponse.json({
      success: true,
      user,
    })

    // Set HTTP-only, SameSite=Lax cookie on parent domain (.zuulab.com in prod)
    const host = request.headers.get('host')
    const cookieDomain = getSessionCookieDomain(host)

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: sessionToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      // Ends at the next midnight, like the sign-in itself
      maxAge: sessionMaxAge(),
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    })

    return response
  } catch (error: any) {
    if (error instanceof AuthSyncError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.code === 'EMAIL_NOT_VERIFIED' ? 403 : 503 }
      )
    }
    console.error('Auth sync error:', error)
    return NextResponse.json(
      { success: false, error: 'Kullanıcı senkronizasyonu sırasında hata oluştu.' },
      { status: 500 }
    )
  }
}
