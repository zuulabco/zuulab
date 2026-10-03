import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/services/auth.service'
import { getAccountBadges, markSectionSeen } from '@/lib/services/account-badges.service'

/** Which account tabs have something new: { orders, support } */
export async function GET(request: Request) {
  try {
    const user = await requireAuth(request)
    const badges = await getAccountBadges(user.id)
    return NextResponse.json({ success: true, badges }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    if (!isAuth) console.error('[account/badges] GET failed:', error)
    return NextResponse.json(
      { success: false, error: isAuth ? 'Oturum gerekli.' : 'Bildirimler alınamadı.' },
      { status: isAuth ? 401 : 500 }
    )
  }
}

const seenSchema = z.object({ section: z.enum(['orders', 'support']) })

/** The customer opened a tab: clear its dot */
export async function POST(request: Request) {
  try {
    const user = await requireAuth(request)
    const parsed = seenSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Geçersiz bölüm.' }, { status: 400 })
    }
    await markSectionSeen(user.id, parsed.data.section)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    const isAuth = error.message?.includes('UNAUTHORIZED')
    if (!isAuth) console.error('[account/badges] POST failed:', error)
    return NextResponse.json(
      { success: false, error: isAuth ? 'Oturum gerekli.' : 'Güncellenemedi.' },
      { status: isAuth ? 401 : 500 }
    )
  }
}
