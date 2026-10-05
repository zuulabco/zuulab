import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/security/rate-limit-response'
import { verifyOptout } from '@/lib/email/automations'
import { getSigningSecret } from '@/lib/services/session.service'
import { recordOptout } from '@/lib/services/email-automation.service'

export const dynamic = 'force-dynamic'

/**
 * "I do not want these e-mails" (the review request). The link in the mail carries the address and
 * its signature (?e=…&s=…): mail apps' one-click unsubscribe posts to it as it is, and the
 * /eposta/ayril page posts the same values from its button. Only a link we signed can add an
 * address, so nobody can opt someone else out.
 */
export async function POST(request: Request) {
  const limited = await rateLimit(request, 'newsletter')
  if (limited) return limited

  const url = new URL(request.url)
  let e = url.searchParams.get('e') || ''
  let s = url.searchParams.get('s') || ''
  if (!e || !s) {
    const body = await request.json().catch(() => ({}))
    e = typeof body.e === 'string' ? body.e : ''
    s = typeof body.s === 'string' ? body.s : ''
  }
  const email = verifyOptout(getSigningSecret(), e, s)
  if (!email) {
    return NextResponse.json({ success: false, error: 'Bağlantı geçersiz ya da süresi dolmuş.' }, { status: 400 })
  }
  await recordOptout(email)
  return NextResponse.json({ success: true })
}
