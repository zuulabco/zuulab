import 'server-only'
import { NextResponse } from 'next/server'
import { getClientIp } from '@/lib/config/maintenance'
import { checkRateLimit } from './rate-limiter'

/**
 * Per-endpoint request budgets (per client IP unless a key is given). Sized for
 * real customers with headroom; they exist to stop scripted abuse such as coupon
 * guessing, order-number enumeration and checkout flooding.
 */
export const RATE_LIMITS = {
  checkout: { limit: 10, windowSeconds: 600 },
  authSync: { limit: 30, windowSeconds: 600 },
  couponValidate: { limit: 20, windowSeconds: 600 },
  cartQuote: { limit: 120, windowSeconds: 60 },
  search: { limit: 120, windowSeconds: 60 },
  orderLookup: { limit: 30, windowSeconds: 600 },
  paymentRetry: { limit: 10, windowSeconds: 600 },
  // The PayTR page polls every 4s (~150 per 10 min) while the customer pays.
  paymentStatus: { limit: 300, windowSeconds: 600 },
  supportTicket: { limit: 10, windowSeconds: 3600 },
  review: { limit: 10, windowSeconds: 3600 },
} as const

export type RateLimitName = keyof typeof RATE_LIMITS

/**
 * Returns a 429 response when the caller is over budget, otherwise null.
 *
 *   const limited = await rateLimit(request, 'checkout')
 *   if (limited) return limited
 */
export async function rateLimit(request: Request, name: RateLimitName, key?: string): Promise<NextResponse | null> {
  const { limit, windowSeconds } = RATE_LIMITS[name]
  const subject = key ?? `ip:${getClientIp(new Headers(request.headers))}`
  const result = await checkRateLimit(`${name}:${subject}`, limit, windowSeconds)
  if (result.allowed) return null
  return NextResponse.json(
    { success: false, error: 'Çok fazla istek gönderildi. Lütfen biraz bekleyip tekrar deneyin.' },
    { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil(result.resetMs / 1000))) } }
  )
}
