import { NextResponse } from 'next/server'
import { commercialEmailEnabled } from '@/lib/email/policy'

export const dynamic = 'force-dynamic'

/**
 * Public: is commercial e-mail switched on (COMMERCIAL_EMAIL_ENABLED)? The storefront asks before it shows
 * anything that collects an e-mail permission (the modal after sign-in, the box on the payment page, the
 * preferences in the account). Reveals nothing but that one yes / no.
 */
export async function GET() {
  return NextResponse.json({ commercial: commercialEmailEnabled() }, { headers: { 'Cache-Control': 'no-store' } })
}
