import 'server-only'
import { SEED_COUPONS } from './db-fallback'

export interface CouponValidationResult {
  valid: boolean
  code?: string
  discountAmount?: number
  type?: 'PERCENTAGE' | 'FIXED' | 'FREE_SHIPPING'
  message?: string
}

/**
 * Validates a coupon code against current subtotal
 */
export async function validateCoupon(
  code: string,
  subtotal: number
): Promise<CouponValidationResult> {
  const clean = code.trim().toUpperCase()
  if (!clean) {
    return { valid: false, message: 'Lütfen bir kupon kodu girin.' }
  }

  const coupon = SEED_COUPONS.find((c) => c.code === clean && c.isActive)

  if (!coupon) {
    return { valid: false, message: 'Geçersiz veya süresi dolmuş kupon kodu.' }
  }

  if (coupon.minCartAmount && subtotal < coupon.minCartAmount) {
    return {
      valid: false,
      message: `Bu kupon en az ${coupon.minCartAmount} ₺ tutarındaki sepetlerde geçerlidir.`,
    }
  }

  let discount = 0
  if (coupon.type === 'PERCENTAGE') {
    discount = (subtotal * coupon.discountValue) / 100
  } else if (coupon.type === 'FIXED') {
    discount = Math.min(subtotal, coupon.discountValue)
  } else if (coupon.type === 'FREE_SHIPPING') {
    discount = 49.9
  }

  return {
    valid: true,
    code: coupon.code,
    discountAmount: Math.round(discount * 100) / 100,
    type: coupon.type,
    message: `${coupon.code} kuponu başarıyla uygulandı.`,
  }
}
