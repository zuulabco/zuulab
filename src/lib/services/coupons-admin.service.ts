import 'server-only'
import { SEED_COUPONS } from './db-fallback'
import { getAllOrders } from './orders.service'
import { logAuditEvent } from './admin.service'

export interface AdminCoupon {
  id: string
  code: string
  description?: string
  type: 'PERCENTAGE' | 'FIXED' | 'FREE_SHIPPING'
  discountValue: number
  minCartAmount?: number | null
  maxDiscount?: number | null
  maxUses?: number | null
  currentUses: number
  isActive: boolean
  validFrom?: string | null
  validUntil?: string | null
}

let couponsList: AdminCoupon[] = [...SEED_COUPONS]

/**
 * Retrieves all coupons with real-time order usage statistics
 */
export async function adminGetCouponsWithStats() {
  const orders = await getAllOrders()

  return couponsList.map((coup) => {
    const matchingOrders = orders.filter((o) => o.couponCode === coup.code)
    const usageCount = matchingOrders.length
    const totalDiscountGranted = matchingOrders.reduce((sum, o) => sum + o.discountAmount, 0)
    const revenueGenerated = matchingOrders.reduce((sum, o) => sum + o.totalAmount, 0)
    const remainingLimit = coup.maxUses ? Math.max(0, coup.maxUses - usageCount) : null

    return {
      ...coup,
      usedCount: usageCount,
      totalDiscountGranted,
      revenueGenerated,
      remainingLimit,
      stats: {
        usageCount,
        totalDiscountGranted,
        revenueGenerated,
        remainingLimit,
      },
    }
  })
}

/**
 * Creates a new promotional coupon
 */
export async function adminCreateCoupon(
  payload: Omit<AdminCoupon, 'id' | 'currentUses' | 'isActive'> & { isActive?: boolean },
  adminEmail = 'system'
) {
  const code = payload.code.trim().toUpperCase()
  if (couponsList.some((c) => c.code === code)) {
    throw new Error(`'${code}' koduna sahip bir kupon zaten mevcut.`)
  }

  const newCoupon: AdminCoupon = {
    id: `coup-${Date.now()}`,
    ...payload,
    code,
    currentUses: 0,
    isActive: payload.isActive !== undefined ? payload.isActive : true,
  }

  couponsList.unshift(newCoupon)

  await logAuditEvent({
    action: 'COUPON_CREATED',
    entity: 'Coupon',
    entityId: newCoupon.id,
    metadata: { code, type: newCoupon.type, value: newCoupon.discountValue, adminEmail },
  })

  return newCoupon
}

/**
 * Updates an existing coupon
 */
export async function adminUpdateCoupon(
  id: string,
  payload: Partial<AdminCoupon>,
  adminEmail = 'system'
) {
  const index = couponsList.findIndex((c) => c.id === id)
  if (index === -1) throw new Error('Kupon bulunamadı.')

  const updated = {
    ...couponsList[index],
    ...payload,
    code: payload.code ? payload.code.trim().toUpperCase() : couponsList[index].code,
  }

  couponsList[index] = updated

  await logAuditEvent({
    action: 'COUPON_UPDATED',
    entity: 'Coupon',
    entityId: id,
    metadata: { code: updated.code, adminEmail },
  })

  return updated
}

/**
 * Toggles coupon activation status
 */
export async function adminToggleCoupon(id: string, isActive: boolean, adminEmail = 'system') {
  return adminUpdateCoupon(id, { isActive }, adminEmail)
}
