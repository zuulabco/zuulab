import 'server-only'
import { db } from '@/prisma/db'
import { dbNumeric } from '@/lib/db/numeric'
import { dbTimestampToIso, toDbTimestamp } from '@/lib/db/time'
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
  maxUsesPerUser?: number | null
  currentUses: number
  isActive: boolean
  validFrom?: string | null
  validUntil?: string | null
}

const COUPON_TYPES = new Set(['PERCENTAGE', 'FIXED', 'FREE_SHIPPING'])

type CouponRow = NonNullable<Awaited<ReturnType<ReturnType<typeof db.orm.public.Coupon.where>['first']>>>

function toAdminCoupon(row: CouponRow): AdminCoupon {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
  return {
    id: row.id,
    code: row.code,
    description: row.description ?? undefined,
    type: row.type as AdminCoupon['type'],
    discountValue: Number(row.discountValue),
    minCartAmount: num(row.minCartAmount),
    maxDiscount: num(row.maxDiscount),
    maxUses: row.maxUses ?? null,
    maxUsesPerUser: row.maxUsesPerUser ?? null,
    currentUses: row.currentUses,
    isActive: row.isActive,
    validFrom: dbTimestampToIso(row.validFrom),
    validUntil: dbTimestampToIso(row.validUntil),
  }
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) throw new Error('Sayısal alanlar sıfır veya pozitif olmalıdır.')
  return n
}

function optionalDate(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const d = new Date(String(value))
  if (Number.isNaN(d.getTime())) throw new Error('Geçersiz tarih.')
  return toDbTimestamp(d)
}

/** Validates admin input and maps it to DB columns; only provided fields are returned. */
function toColumns(payload: Partial<AdminCoupon>) {
  const out: Record<string, unknown> = {}
  if (payload.code !== undefined) {
    const code = String(payload.code).trim().toUpperCase()
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) {
      throw new Error('Kupon kodu 3-30 karakter olmalı; yalnızca harf, rakam, - ve _ içerebilir.')
    }
    out.code = code
  }
  if (payload.type !== undefined) {
    if (!COUPON_TYPES.has(payload.type)) throw new Error('Geçersiz kupon türü.')
    out.type = payload.type
  }
  if (payload.discountValue !== undefined) {
    const v = optionalNumber(payload.discountValue) ?? 0
    if (payload.type === 'PERCENTAGE' && v > 100) throw new Error('Yüzde indirimi 100\'den büyük olamaz.')
    out.discountValue = dbNumeric(v)
  }
  if (payload.description !== undefined) out.description = payload.description || null
  if (payload.minCartAmount !== undefined) {
    const v = optionalNumber(payload.minCartAmount)
    out.minCartAmount = v === null ? null : dbNumeric(v)
  }
  if (payload.maxDiscount !== undefined) {
    const v = optionalNumber(payload.maxDiscount)
    out.maxDiscount = v === null ? null : dbNumeric(v)
  }
  if (payload.maxUses !== undefined) out.maxUses = optionalNumber(payload.maxUses)
  if (payload.maxUsesPerUser !== undefined) out.maxUsesPerUser = optionalNumber(payload.maxUsesPerUser)
  if (payload.isActive !== undefined) out.isActive = Boolean(payload.isActive)
  if (payload.validFrom !== undefined) out.validFrom = optionalDate(payload.validFrom)
  if (payload.validUntil !== undefined) out.validUntil = optionalDate(payload.validUntil)
  return out
}

const COUNTED_STATUSES = new Set([
  'PAYMENT_RECEIVED', 'CONFIRMED', 'PREPARING', 'IN_PRODUCTION', 'PACKING', 'SHIPPED', 'DELIVERED',
])

/**
 * Retrieves all coupons with usage statistics from paid orders.
 */
export async function adminGetCouponsWithStats() {
  const coupons = await db.orm.public.Coupon.orderBy((c) => c.createdAt.desc()).all()
  const ids = coupons.map((c) => c.id)
  const orders = ids.length
    ? await db.orm.public.Order
        .select('couponId', 'status', 'discountAmount', 'total')
        .where((o) => o.couponId.in(ids))
        .all()
    : []

  return coupons.map((row) => {
    const coup = toAdminCoupon(row)
    const paid = orders.filter((o) => o.couponId === coup.id && COUNTED_STATUSES.has(o.status))
    const usageCount = coup.currentUses
    const totalDiscountGranted = paid.reduce((sum, o) => sum + Number(o.discountAmount), 0)
    const revenueGenerated = paid.reduce((sum, o) => sum + Number(o.total), 0)
    const remainingLimit = coup.maxUses ? Math.max(0, coup.maxUses - usageCount) : null

    return {
      ...coup,
      usedCount: usageCount,
      totalDiscountGranted,
      revenueGenerated,
      remainingLimit,
      stats: { usageCount, totalDiscountGranted, revenueGenerated, remainingLimit },
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
  const columns = toColumns({ ...payload, isActive: payload.isActive ?? true })
  const existing = await db.orm.public.Coupon.where({ code: String(columns.code) }).first()
  if (existing) {
    throw new Error(`'${columns.code}' koduna sahip bir kupon zaten mevcut.`)
  }

  const created = await db.orm.public.Coupon.create({ currentUses: 0, ...columns } as never)
  const coupon = toAdminCoupon(created)

  await logAuditEvent({
    action: 'COUPON_CREATED',
    entity: 'Coupon',
    entityId: coupon.id,
    metadata: { code: coupon.code, type: coupon.type, value: coupon.discountValue, adminEmail },
  })

  return coupon
}

/**
 * Updates an existing coupon
 */
export async function adminUpdateCoupon(
  id: string,
  payload: Partial<AdminCoupon>,
  adminEmail = 'system'
) {
  const current = await db.orm.public.Coupon.where({ id }).first()
  if (!current) throw new Error('Kupon bulunamadı.')

  // Usage counters are owned by checkout, never by the edit form.
  const { currentUses: _ignored, id: _id, ...editable } = payload
  void _ignored
  void _id
  const columns = toColumns({ type: current.type as AdminCoupon['type'], ...editable })

  if (columns.code && columns.code !== current.code) {
    const clash = await db.orm.public.Coupon.where({ code: String(columns.code) }).first()
    if (clash) throw new Error(`'${columns.code}' koduna sahip bir kupon zaten mevcut.`)
  }

  await db.orm.public.Coupon.where({ id }).update(columns as never)
  const updated = toAdminCoupon((await db.orm.public.Coupon.where({ id }).first())!)

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
