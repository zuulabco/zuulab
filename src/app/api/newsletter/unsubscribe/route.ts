import { NextResponse } from 'next/server'
import { unsubscribeNewsletter } from '@/lib/services/newsletter.service'

/**
 * Unsubscribe by token. Mail apps call this directly for the one-click
 * "List-Unsubscribe" button (RFC 8058: POST with ?t=…); the /bulten/ayril page
 * posts { token } from its button.
 */
export async function POST(request: Request) {
  const url = new URL(request.url)
  let token = url.searchParams.get('t') || ''
  let messageId = url.searchParams.get('m') || ''
  if (!token) {
    const body = await request.json().catch(() => ({}))
    token = typeof body.token === 'string' ? body.token : ''
    messageId = typeof body.message === 'string' ? body.message : ''
  }
  const result = await unsubscribeNewsletter(token, messageId || undefined)
  if (!result.ok) {
    return NextResponse.json({ success: false, error: 'Bağlantı geçersiz ya da süresi dolmuş.' }, { status: 404 })
  }
  return NextResponse.json({ success: true })
}
