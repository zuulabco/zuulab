import { NextResponse } from 'next/server'
import {
  getSessionCookieDomain,
  SESSION_COOKIE_NAME,
} from '@/lib/services/session.service'

export async function POST(request: Request) {
  const host = request.headers.get('host')
  const cookieDomain = getSessionCookieDomain(host)

  const response = NextResponse.json({ success: true })

  // Clear session cookie across parent domain (.zuulab.com in prod)
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  })

  return response
}
