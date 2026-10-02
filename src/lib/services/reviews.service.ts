import 'server-only'
import { db } from '@/prisma/db'
import { dbTimestampToIso } from '@/lib/db/time'
import { invalidateCatalog } from '@/lib/cache/catalog-cache'
import { logAuditEvent } from './admin.service'

/**
 * Product reviews, stored in Postgres only. The storefront shows APPROVED reviews
 * and the ratings derived from them (catalog snapshot); nothing is shown for a
 * product nobody has reviewed. Only customers with a paid order containing the
 * product may review it, once per product.
 */

export type ReviewStatusType = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface ReviewItem {
  id: string
  userId: string
  userEmail: string
  userName: string
  productId: string
  productName: string
  productSlug: string
  orderId: string | null
  rating: number
  title: string | null
  body: string | null
  status: ReviewStatusType
  isVerifiedBuy: boolean
  moderationNote: string | null
  createdAt: string
  updatedAt: string
}

export interface ReviewStats {
  averageRating: number
  totalCount: number
  breakdown: Record<number, number> // 1..5 -> count
}

/** Orders whose payment is complete; a review needs one of these. */
const REVIEWABLE_ORDER_STATUSES = ['CONFIRMED', 'PREPARING', 'IN_PRODUCTION', 'PACKING', 'SHIPPED', 'DELIVERED']

/** "Ayşe Yılmaz" -> "Ayşe Y."; never exposes an email address publicly. */
function publicName(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'zuulab müşterisi'
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1][0].toLocaleUpperCase('tr-TR')}.`
}

function reviewQuery() {
  return db.orm.public.Review
    .include('user', (u) => u.select('id', 'name', 'email'))
    .include('product', (p) => p.select('id', 'name', 'slug'))
}

type ReviewRow = NonNullable<Awaited<ReturnType<ReturnType<typeof reviewQuery>['first']>>>

function toReviewItem(r: ReviewRow, options: { exposeEmail: boolean }): ReviewItem {
  return {
    id: r.id,
    userId: r.userId,
    userEmail: options.exposeEmail ? r.user?.email ?? '' : '',
    userName: options.exposeEmail ? r.user?.name || r.user?.email || 'Müşteri' : publicName(r.user?.name),
    productId: r.productId,
    productName: r.product?.name ?? '',
    productSlug: r.product?.slug ?? '',
    orderId: r.orderId ?? null,
    rating: r.rating,
    title: r.title ?? null,
    body: r.body ?? null,
    status: r.status as ReviewStatusType,
    isVerifiedBuy: r.isVerifiedBuy,
    moderationNote: options.exposeEmail ? r.moderationNote ?? null : null,
    createdAt: dbTimestampToIso(r.createdAt) ?? '',
    updatedAt: dbTimestampToIso(r.updatedAt) ?? '',
  }
}

/**
 * Resolves a product's ID and Name from either ID or Slug
 */
export async function resolveProduct(productIdOrSlug: string): Promise<{ id: string; name: string; slug: string } | null> {
  const prod =
    (await db.orm.public.Product.where({ slug: productIdOrSlug }).first()) ??
    (await db.orm.public.Product.where({ id: productIdOrSlug }).first())
  return prod ? { id: prod.id, name: prod.name, slug: prod.slug } : null
}

/**
 * Verifies server-side whether a customer has a paid order containing the product
 */
export async function verifyCustomerPurchase(userId: string, productId: string): Promise<{ isVerified: boolean; orderId: string | null }> {
  const orders = await db.orm.public.Order
    .select('id', 'status')
    .where({ userId })
    .where((o) => o.status.in(REVIEWABLE_ORDER_STATUSES as never[]))
    .all()
  if (orders.length === 0) return { isVerified: false, orderId: null }

  const item = await db.orm.public.OrderItem
    .select('orderId')
    .where({ productId })
    .where((i) => i.orderId.in(orders.map((o) => o.id)))
    .first()
  return item ? { isVerified: true, orderId: item.orderId } : { isVerified: false, orderId: null }
}

/**
 * Approved public reviews and aggregate rating metrics for a product
 */
export async function getProductReviews(
  productIdOrSlug: string
): Promise<{ reviews: ReviewItem[]; stats: ReviewStats }> {
  const prod = await resolveProduct(productIdOrSlug)
  if (!prod) {
    return { reviews: [], stats: { averageRating: 0, totalCount: 0, breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } } }
  }

  const rows = await reviewQuery()
    .where({ productId: prod.id, status: 'APPROVED' })
    .orderBy((r) => r.createdAt.desc())
    .limit(200)
    .all()
  const reviews = rows.map((r) => toReviewItem(r, { exposeEmail: false }))

  const breakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  let sum = 0
  for (const r of reviews) {
    const star = Math.min(5, Math.max(1, r.rating))
    breakdown[star] += 1
    sum += star
  }

  return {
    reviews,
    stats: {
      averageRating: reviews.length > 0 ? Number((sum / reviews.length).toFixed(1)) : 0,
      totalCount: reviews.length,
      breakdown,
    },
  }
}

/**
 * Creates a PENDING review for a customer who bought the product
 */
export async function createProductReview(
  user: { id: string; email: string; name?: string | null },
  payload: { productIdOrSlug: string; rating: number; title?: string | null; body: string }
): Promise<ReviewItem> {
  const prod = await resolveProduct(payload.productIdOrSlug)
  if (!prod) {
    throw new Error('NOT_FOUND: Değerlendirilecek ürün bulunamadı.')
  }

  const body = (payload.body ?? '').trim()
  if (body.length < 5) {
    throw new Error('VALIDATION_ERROR: Değerlendirme yorumu en az 5 karakter olmalıdır.')
  }
  if (body.length > 2000) {
    throw new Error('VALIDATION_ERROR: Değerlendirme yorumu en fazla 2000 karakter olabilir.')
  }
  const rating = Math.min(5, Math.max(1, Math.round(Number(payload.rating) || 0)))

  if (await db.orm.public.Review.where({ userId: user.id, productId: prod.id }).first()) {
    throw new Error('DUPLICATE_REVIEW: Bu ürün için daha önce bir değerlendirme yazdınız.')
  }

  const purchase = await verifyCustomerPurchase(user.id, prod.id)
  if (!purchase.isVerified) {
    throw new Error('NOT_ELIGIBLE: Yalnızca bu ürünü satın almış müşteriler değerlendirme yapabilir.')
  }

  let created
  try {
    created = await db.orm.public.Review.create({
      userId: user.id,
      productId: prod.id,
      orderId: purchase.orderId,
      rating,
      title: payload.title?.trim().slice(0, 120) || null,
      body,
      status: 'PENDING',
      isVerifiedBuy: true,
    })
  } catch (err) {
    // The (user, product) unique index settles a double submit.
    if (/unique|duplicate key|23505/i.test(String((err as Error)?.message ?? err) + JSON.stringify(err ?? {}))) {
      throw new Error('DUPLICATE_REVIEW: Bu ürün için daha önce bir değerlendirme yazdınız.')
    }
    throw err
  }

  const row = await reviewQuery().where({ id: created.id }).first()
  return toReviewItem(row!, { exposeEmail: true })
}

/**
 * Admin: all reviews, optionally filtered by status, newest first
 */
export async function getAdminReviews(statusFilter?: ReviewStatusType): Promise<ReviewItem[]> {
  let query = reviewQuery()
  if (statusFilter) query = query.where({ status: statusFilter })
  const rows = await query.orderBy((r) => r.createdAt.desc()).limit(500).all()
  return rows.map((r) => toReviewItem(r, { exposeEmail: true }))
}

/**
 * Admin: approves or rejects a review. Ratings on the storefront follow the
 * approved set, so the catalog cache is refreshed.
 */
export async function moderateReview(
  adminUserId: string,
  reviewId: string,
  action: 'APPROVE' | 'REJECT',
  moderationNote?: string
): Promise<ReviewItem> {
  const existing = await db.orm.public.Review.where({ id: reviewId }).first()
  if (!existing) {
    throw new Error('NOT_FOUND: Değerlendirme bulunamadı.')
  }

  const newStatus: ReviewStatusType = action === 'APPROVE' ? 'APPROVED' : 'REJECTED'
  await db.orm.public.Review.where({ id: reviewId }).update({
    status: newStatus,
    moderationNote: moderationNote?.trim() || null,
  })

  invalidateCatalog()
  await logAuditEvent({
    userId: adminUserId,
    action: `review.${action.toLowerCase()}d`,
    entity: 'Review',
    entityId: reviewId,
    metadata: { newStatus, moderationNote },
  })

  const row = await reviewQuery().where({ id: reviewId }).first()
  return toReviewItem(row!, { exposeEmail: true })
}
