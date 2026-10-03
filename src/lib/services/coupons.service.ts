import 'server-only'
import { db } from '@/prisma/db'
import { round2 } from '@/lib/pricing/money'
import { fromDbTimestamp } from '@/lib/db/time'
import { quoteCart } from './checkout/pricing.service'

export type CouponType = 'PERCENTAGE' | 'FIXED' | 'FREE_SHIPPING'

export interface ApplicableCoupon {
  id: string
  code: string
  type: CouponType
  discountValue: number
  maxDiscount: number | null
}

export interface CouponValidationResult {
  valid: boolean
  code?: string
  discountAmount?: number
  type?: CouponType
  message?: string
}

/**
 * Resolves a coupon code to a coupon the given cart may use, enforcing activity,
 * validity window, global and per-user usage limits and the minimum cart amount.
 * Usage counters are incremented only when the order is paid (see
 * `recordCouponUsage`), so abandoned checkouts never consume a coupon.
 */
export async function resolveCoupon(params: {
  code: string
  subtotal: number
  userId?: string | null
}): Promise<{ coupon: ApplicableCoupon | null; error?: string }> {
  const code = params.code.trim().toUpperCase()
  if (!code) return { coupon: null, error: 'Lütfen bir kupon kodu girin.' }

  const row = await db.orm.public.Coupon.where({ code }).first()
  if (!row || !row.isActive) {
    return { coupon: null, error: 'Geçersiz veya süresi dolmuş kupon kodu.' }
  }

  const now = Date.now()
  const validFrom = fromDbTimestamp(row.validFrom)
  const validUntil = fromDbTimestamp(row.validUntil)
  if ((validFrom && validFrom.getTime() > now) || (validUntil && validUntil.getTime() < now)) {
    return { coupon: null, error: 'Bu kuponun geçerlilik süresi dışında bulunuyorsunuz.' }
  }

  if (row.maxUses !== null && row.maxUses !== undefined && row.currentUses >= row.maxUses) {
    return { coupon: null, error: 'Bu kuponun kullanım limiti dolmuştur.' }
  }

  const minCart = row.minCartAmount !== null ? Number(row.minCartAmount) : 0
  if (minCart > 0 && params.subtotal < minCart) {
    return { coupon: null, error: `Bu kupon en az ${minCart} ₺ tutarındaki sepetlerde geçerlidir.` }
  }

  if (params.userId && row.maxUsesPerUser) {
    const used = await db.orm.public.CouponUsage
      .where({ couponId: row.id, userId: params.userId })
      .aggregate((a) => ({ n: a.count() }))
    if (used.n >= row.maxUsesPerUser) {
      return { coupon: null, error: 'Bu kuponu kullanım hakkınız dolmuştur.' }
    }
  }

  return {
    coupon: {
      id: row.id,
      code: row.code,
      type: row.type as CouponType,
      discountValue: Number(row.discountValue),
      maxDiscount: row.maxDiscount !== null && row.maxDiscount !== undefined ? Number(row.maxDiscount) : null,
    },
  }
}

/**
 * Product discount granted by a coupon. FREE_SHIPPING grants no product discount;
 * it zeroes the shipping fee instead, so it can never be counted twice.
 */
export function couponProductDiscount(coupon: ApplicableCoupon, subtotal: number): number {
  if (coupon.type === 'PERCENTAGE') {
    const raw = (subtotal * coupon.discountValue) / 100
    return round2(Math.min(subtotal, coupon.maxDiscount !== null ? Math.min(raw, coupon.maxDiscount) : raw))
  }
  if (coupon.type === 'FIXED') {
    return round2(Math.min(subtotal, coupon.discountValue))
  }
  return 0
}

/**
 * Counts a paid order's coupon use exactly once: the (coupon, order) unique index
 * rejects a repeat, and the counter is only bumped by the insert that succeeded.
 */
export async function recordCouponUsage(orderId: string): Promise<void> {
  const order = await db.orm.public.Order.select('id', 'couponId', 'userId').where({ id: orderId }).first()
  if (!order?.couponId) return
  const couponId = order.couponId

  try {
    await db.transaction(async (tx) => {
      await tx.orm.public.CouponUsage.create({ couponId, userId: order.userId, orderId })
      await tx.execute(
        db.raw.sql`UPDATE coupons SET current_uses = current_uses + 1, updated_at = now() WHERE id = ${couponId}`.affectedCount().build()
      )
    })
  } catch (err) {
    const text = String((err as { message?: string })?.message ?? err) + JSON.stringify(err ?? {})
    if (/unique|duplicate key|23505/i.test(text)) return
    throw err
  }
}

/**
 * Storefront coupon check. Prices the actual cart so the shown discount is exactly
 * what checkout will charge.
 */
export async function validateCoupon(params: {
  code: string
  items: Array<{ productId: string; variantId?: string | null; quantity: number }>
  shippingMethod?: 'STANDARD' | 'EXPRESS'
  userId?: string | null
}): Promise<CouponValidationResult> {
  const quote = await quoteCart({
    items: params.items,
    couponCode: params.code,
    shippingMethod: params.shippingMethod,
    userId: params.userId,
  })

  if (!quote.coupon) {
    return { valid: false, message: quote.couponError || 'Geçersiz veya süresi dolmuş kupon kodu.' }
  }

  return {
    valid: true,
    code: quote.coupon.code,
    type: quote.coupon.type,
    discountAmount: quote.couponDiscount,
    message: `${quote.coupon.code} kuponu başarıyla uygulandı.`,
  }
}
