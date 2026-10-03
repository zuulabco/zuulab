import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/security/rate-limit-response'
import { getClientIp } from '@/lib/config/maintenance'
import { subscribeToNewsletter } from '@/lib/services/newsletter.service'

const MESSAGES = {
  confirmation_sent: 'Onay e-postası gönderdik. Gelen kutundaki bağlantıya tıklayınca indirim kodun gelecek.',
  confirmation_recently_sent: 'Onay e-postası az önce gönderildi; gelen kutunu (ve gereksiz klasörünü) kontrol et.',
  already_active: 'Bu e-posta zaten bültenimizde kayıtlı.',
} as const

/** POST { email, consent: true, source? } — starts a double opt-in subscription. */
export async function POST(request: Request) {
  const limited = await rateLimit(request, 'newsletter')
  if (limited) return limited

  try {
    const body = await request.json().catch(() => ({}))
    const outcome = await subscribeToNewsletter({
      email: body.email,
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
