import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/services/auth.service'
import { getClientIp } from '@/lib/config/maintenance'
import { db } from '@/prisma/db'
import { declineEmailConsent, getConsentStatus, grantEmailConsent } from '@/lib/services/email-consent.service'

export const dynamic = 'force-dynamic'

/** Is the account's e-mail address verified (Google sign-in, or confirmed by link)? Only then is it asked for permission. */
async function isVerified(userId: string): Promise<boolean> {
  const [row] = (await db.runtime().query(
    db.raw.sql`SELECT email_verified AS v FROM users WHERE id = ${userId}`.returnsRow({ v: 'pg/bool@1' } as never).build() as never
  )) as unknown as Array<{ v: boolean }>
  return row?.v === true
}

/**
 * GET → the signed-in member's e-mail permission: { status, eligible }. `eligible` is false for an
 * address that is not verified yet, so nobody can give a permission in someone else's name.
 */
export async function GET(request: Request) {
  try {
    const user = await requireAuth(request)
    const [status, eligible] = await Promise.all([getConsentStatus(user.email), isVerified(user.id)])
    return NextResponse.json({ success: true, email: user.email, status, eligible }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ success: false }, { status: 401 })
  }
}

const bodySchema = z.object({ answer: z.enum(['accept', 'decline']) })

/** POST { answer: "accept" | "decline" } → the member's answer to the modal */
export async function POST(request: Request) {
  let user
  try {
    user = await requireAuth(request)
  } catch {
    return NextResponse.json({ success: false }, { status: 401 })
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ success: false, error: 'Geçersiz istek.' }, { status: 400 })

  const proof = { email: user.email, source: 'member_modal' as const, userId: user.id, ip: getClientIp(new Headers(request.headers)), userAgent: request.headers.get('user-agent') }
  try {
    if (parsed.data.answer === 'accept') {
      if (!(await isVerified(user.id))) {
        return NextResponse.json({ success: false, error: 'Önce e-posta adresini doğrulamalısın.' }, { status: 400 })
      }
      await grantEmailConsent(proof)
    } else {
      await declineEmailConsent(proof)
    }
    return NextResponse.json({ success: true, status: await getConsentStatus(user.email) })
  } catch (error) {
    console.error('[account/email-consent]', error)
    return NextResponse.json({ success: false, error: 'İşlem tamamlanamadı.' }, { status: 500 })
  }
}
