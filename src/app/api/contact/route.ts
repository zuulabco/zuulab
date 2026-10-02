import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getOrCreateGuestUser } from '@/lib/services/auth.service'
import { createTicket } from '@/lib/services/support.service'
import { checkRateLimit } from '@/lib/security/rate-limiter'
import { getClientIp } from '@/lib/config/maintenance'

const contactSchema = z.object({
  name: z.string().trim().min(2, 'Ad soyad en az 2 karakter olmalıdır.').max(80),
  email: z.string().trim().email('Geçerli bir e-posta adresi giriniz.').max(160),
  subject: z.string().trim().min(3, 'Konu en az 3 karakter olmalıdır.').max(150),
  message: z.string().trim().min(10, 'Mesajınız en az 10 karakter olmalıdır.').max(5000),
  // Honeypot: a hidden field people never fill in; bots usually do.
  website: z.string().optional(),
})

/**
 * Public contact form. Each message becomes a CONTACT_FORM support ticket owned by
 * the sender's (guest) customer record, so staff answer it from the support
 * screen and the reply is emailed back. Rate limited per IP and per address.
 */
export async function POST(request: Request) {
  const parsed = contactSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message || 'Lütfen formu kontrol edin.' },
      { status: 400 }
    )
  }
  const { name, email, subject, message, website } = parsed.data

  // Pretend success to bots so they do not adapt.
  if (website) {
    return NextResponse.json({ success: true })
  }

  const ip = getClientIp(new Headers(request.headers))
  const [byIp, byEmail] = await Promise.all([
    checkRateLimit(`contact:ip:${ip}`, 5, 3600),
    checkRateLimit(`contact:email:${email.toLowerCase()}`, 3, 3600),
  ])
  if (!byIp.allowed || !byEmail.allowed) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla mesaj gönderildi. Lütfen bir süre sonra tekrar deneyin.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(Math.max(byIp.resetMs, byEmail.resetMs) / 1000)) } }
    )
  }

  try {
    const guest = await getOrCreateGuestUser({ email, fullName: name })
    const ticket = await createTicket(
      { id: guest.id, email: guest.email, name },
      { subject, message, category: 'GENERAL', channel: 'CONTACT_FORM' }
    )
    return NextResponse.json({ success: true, ticketId: ticket.id })
  } catch (error) {
    console.error('[contact] Could not record message:', error)
    return NextResponse.json(
      { success: false, error: 'Mesajınız şu anda iletilemedi. Lütfen info@zuulab.com adresine e-posta gönderin.' },
      { status: 500 }
    )
  }
}
