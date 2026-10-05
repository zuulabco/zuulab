import { NextResponse } from 'next/server'
import { verifySvixSignature } from '@/lib/email/campaign'
import { applyResendEvent } from '@/lib/services/email-campaign.service'

export const dynamic = 'force-dynamic'

/**
 * Resend webhook: delivered, opened, clicked, bounced, complained and failed events of the
 * newsletter campaign mails. Resend signs deliveries (Svix); the signing secret is
 * RESEND_WEBHOOK_SECRET ("whsec_…"). Without it, or with a bad signature, every call is refused.
 * The raw body is verified before anything is parsed.
 */
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim() || ''
  const raw = await request.text()
  const ok = verifySvixSignature(
    secret,
    {
      id: request.headers.get('svix-id'),
      timestamp: request.headers.get('svix-timestamp'),
      signature: request.headers.get('svix-signature'),
    },
    raw
  )
  if (!ok) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })

  let payload: { type?: unknown; data?: Record<string, unknown> }
  try {
    payload = JSON.parse(raw)
  } catch {
    return NextResponse.json({ success: true, ignored: true })
  }

  try {
    const outcome = await applyResendEvent(request.headers.get('svix-id') as string, payload)
    // 'retry': the mail was sent a moment ago and our own record of it is not saved yet; a non-2xx makes Resend deliver again
    if (outcome === 'retry') return NextResponse.json({ success: false, error: 'not yet known' }, { status: 409 })
    return NextResponse.json({ success: true, outcome })
  } catch (error) {
    console.error('[webhooks/resend]', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
