import { NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateRequest } from '@/lib/services/auth.service'
import { createStockAlert } from '@/lib/services/stock-alerts.service'
import { checkRateLimit } from '@/lib/security/rate-limiter'
import { getClientIp } from '@/lib/config/maintenance'

const schema = z.object({
  productId: z.string().min(1).max(64),
  variantId: z.string().min(1).max(64).nullish(),
  email: z.string().trim().email('Geçerli bir e-posta adresi girin.').max(200),
})

/** Records a "tell me when it is back" request for an out-of-stock product */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message || 'Geçersiz istek.' },
      { status: 400 }
    )
  }

  const ip = getClientIp(new Headers(request.headers))
  const limit = await checkRateLimit(`stock-alert:ip:${ip}`, 10, 3600)
  if (!limit.allowed) {
    return NextResponse.json(
      { success: false, error: 'Çok fazla istek gönderildi. Lütfen daha sonra tekrar deneyin.' },
      { status: 429 }
    )
  }

  try {
    const user = await authenticateRequest(request).catch(() => null)
    await createStockAlert({ ...parsed.data, userId: user?.id ?? null })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    const isNotFound = error.message?.includes('NOT_FOUND')
    if (!isNotFound) console.error('[stock-alerts] could not record request:', error)
    return NextResponse.json(
      { success: false, error: isNotFound ? 'Ürün bulunamadı.' : 'İsteğiniz kaydedilemedi. Lütfen tekrar deneyin.' },
      { status: isNotFound ? 404 : 500 }
    )
  }
}
