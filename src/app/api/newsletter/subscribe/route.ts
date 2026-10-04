import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/security/rate-limit-response'
import { getClientIp } from '@/lib/config/maintenance'
import { subscribeToNewsletter } from '@/lib/services/newsletter.service'
import { requireAuth } from '@/lib/services/auth.service'

const MESSAGES = {
  confirmation_sent: 'Onay e-postası gönderdik. Gelen kutundaki bağlantıya tıklayınca indirim kodun gelecek.',
  confirmation_recently_sent: 'Onay e-postası az önce gönderildi; gelen kutunu (ve gereksiz klasörünü) kontrol et.',
  already_active: 'Bu e-posta zaten bültenimizde kayıtlı.',
} as const

/**
 * POST { email, consent: true, source? } — starts a double opt-in subscription.
 * POST { useAccountEmail: true, consent: true } — the signed-in member subscribes the
 * account address; it is read from the session, never from the request.
 */
export async function POST(request: Request) {
  const limited = await rateLimit(request, 'newsletter')
  if (limited) return limited

  try {
    const body = await request.json().catch(() => ({}))
    let email: unknown = body.email
    if (body.useAccountEmail === true) {
      const user = await requireAuth(request).catch(() => null)
      if (!user) return NextResponse.json({ success: false, error: 'Oturumun sona ermiş; lütfen tekrar giriş yap.' }, { status: 401 })
      email = user.email
    }
    const outcome = await subscribeToNewsletter({
      email,
      consent: body.consent,
      source: typeof body.source === 'string' ? body.source : undefined,
      ip: getClientIp(new Headers(request.headers)),
      userAgent: request.headers.get('user-agent'),
    })
    return NextResponse.json({ success: true, outcome, message: MESSAGES[outcome] })
  } catch (error) {
    const err = error as { message?: string; isValidation?: boolean }
    if (!err.isValidation) console.error('[newsletter/subscribe]', error)
    return NextResponse.json(
      { success: false, error: err.isValidation ? err.message : 'Kaydın şu an alınamadı. Biraz sonra tekrar dene.' },
      { status: err.isValidation ? 400 : 500 }
    )
  }
}
