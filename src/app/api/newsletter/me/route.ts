import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/services/auth.service'
import { newsletterStatusFor } from '@/lib/services/newsletter.service'

/** GET → the signed-in member's account e-mail and its newsletter status */
export async function GET(request: Request) {
  try {
    const user = await requireAuth(request)
    const status = await newsletterStatusFor(user.email).catch(() => null)
    return NextResponse.json({ success: true, email: user.email, status }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ success: false }, { status: 401 })
  }
}
