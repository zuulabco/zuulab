import 'server-only'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { logAuditEvent } from './admin.service'
import { MOCK_PRODUCTS, MOCK_REVIEWS } from '@/lib/mock-data'

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

// In-memory fallback review storage seeded with initial mock reviews
const inMemoryReviews: Map<string, ReviewItem> = new Map()

// Initialize mock reviews into memory
if (inMemoryReviews.size === 0) {
  MOCK_REVIEWS.forEach((mr, idx) => {
    const prod = MOCK_PRODUCTS.find((p) => p.id === mr.productId)
    inMemoryReviews.set(mr.id, {
      id: mr.id,
      userId: `usr-mock-${idx}`,
      userEmail: 'musteri@zuulab.com',
      userName: mr.author,
      productId: mr.productId,
      productName: prod?.name || 'Zuulab Ürün',
      productSlug: prod?.slug || 'zuulab-urun',
      orderId: `ord-mock-${idx}`,
      rating: mr.rating,
      title: mr.title || null,
      body: mr.body || null,
      status: 'APPROVED',
      isVerifiedBuy: mr.verified,
      moderationNote: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  })
}

/**
 * Resolves a product's ID and Name from either ID or Slug
 */
export async function resolveProduct(productIdOrSlug: string): Promise<{ id: string; name: string; slug: string } | null> {
  if (isDatabaseConfigured) {
    try {
      const prod = await db.orm.public.Product.where({ slug: productIdOrSlug }).first() ||
                   await db.orm.public.Product.where({ id: productIdOrSlug }).first()
      if (prod) {
        return { id: prod.id, name: prod.name, slug: prod.slug }
      }
    } catch (err) {
      console.warn('[reviews.service] DB product resolution failed, using fallback:', err)
    }
  }

  const mock = MOCK_PRODUCTS.find((p) => p.slug === productIdOrSlug || p.id === productIdOrSlug)
  if (mock) {
    return { id: mock.id, name: mock.name, slug: mock.slug }
  }
  return null
}

/**
 * Verifies server-side whether a customer has purchased a product
 */
export async function verifyCustomerPurchase(userId: string, productId: string): Promise<{ isVerified: boolean; orderId: string | null }> {
  // 1. Check PostgreSQL if configured
  if (isDatabaseConfigured) {
    try {
      // Find orders belonging to user with confirmed/shipped/delivered status
      const eligibleOrders = await db.orm.public.Order.where({
        userId,
      }).all()

      const validOrderStatuses = ['CONFIRMED', 'PREPARING', 'IN_PRODUCTION', 'PACKING', 'SHIPPED', 'DELIVERED']
      for (const ord of eligibleOrders) {
        if (validOrderStatuses.includes(ord.status)) {
          const items = await db.orm.public.OrderItem.where({
            orderId: ord.id,
            productId,
          }).all()
          if (items.length > 0) {
            return { isVerified: true, orderId: ord.id }
          }
        }
      }
    } catch (err) {
      console.warn('[reviews.service] DB purchase verification failed, using fallback:', err)
    }
  }

  // 2. Check in-memory orders from orders.service
  const { getUserOrders } = await import('./orders.service')
  const orders = await getUserOrders(userId)
  const validOrderStatuses = ['CONFIRMED', 'PREPARING', 'IN_PRODUCTION', 'PACKING', 'SHIPPED', 'DELIVERED']

  for (const ord of orders) {
    if (validOrderStatuses.includes(ord.status)) {
      const itemMatch = ord.items.find((i) => i.productId === productId)
      if (itemMatch) {
        return { isVerified: true, orderId: ord.id }
      }
    }
  }

  return { isVerified: false, orderId: null }
}

/**
 * Retrieves approved public reviews and aggregate rating metrics for a product
 */
export async function getProductReviews(
  productIdOrSlug: string
): Promise<{ reviews: ReviewItem[]; stats: ReviewStats }> {
  const prod = await resolveProduct(productIdOrSlug)
  const productId = prod ? prod.id : productIdOrSlug

  let allReviews: ReviewItem[] = []

  if (isDatabaseConfigured) {
    try {
      const records = await db.orm.public.Review.where({
        productId,
        status: 'APPROVED',
      }).all()

      if (records && records.length > 0) {
        allReviews = records.map((r) => ({
          id: r.id,
          userId: r.userId,
          userEmail: '',
          userName: 'Zuulab Müşterisi',
          productId: r.productId,
          productName: prod?.name || 'Ürün',
          productSlug: prod?.slug || '',
          orderId: r.orderId,
          rating: r.rating,
          title: r.title,
          body: r.body,
          status: r.status as ReviewStatusType,
          isVerifiedBuy: r.isVerifiedBuy,
          moderationNote: r.moderationNote,
          createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
          updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : new Date().toISOString(),
        }))
      }
    } catch (err) {
      console.warn('[reviews.service] DB reviews fetch failed, using fallback:', err)
    }
  }

  if (allReviews.length === 0) {
    allReviews = Array.from(inMemoryReviews.values()).filter(
      (r) => r.productId === productId && r.status === 'APPROVED'
    )
  }

  // Calculate aggregation breakdown
  const breakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  let ratingSum = 0

  for (const rev of allReviews) {
    const star = Math.min(5, Math.max(1, rev.rating))
    breakdown[star] = (breakdown[star] || 0) + 1
    ratingSum += star
  }

  const totalCount = allReviews.length
  const averageRating = totalCount > 0 ? Number((ratingSum / totalCount).toFixed(1)) : 0

  return {
    reviews: allReviews.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    stats: {
      averageRating,
      totalCount,
      breakdown,
    },
  }
}

/**
 * Creates a new product review for an authenticated customer who purchased the product
 */
export async function createProductReview(
  user: { id: string; email: string; name?: string | null },
  payload: { productIdOrSlug: string; rating: number; title?: string | null; body: string }
): Promise<ReviewItem> {
  const prod = await resolveProduct(payload.productIdOrSlug)
  if (!prod) {
    throw new Error('NOT_FOUND: Değerlendirilecek ürün bulunamadı.')
  }

  const productId = prod.id

  // 1. Check duplicate review: One review per user per product
  const existingInMemory = Array.from(inMemoryReviews.values()).find(
    (r) => r.userId === user.id && r.productId === productId
  )
  if (existingInMemory) {
    throw new Error('DUPLICATE_REVIEW: Bu ürün için daha önce bir değerlendirme yazdınız.')
  }

  if (isDatabaseConfigured) {
    try {
      const existingDb = await db.orm.public.Review.where({
        userId: user.id,
        productId,
      }).first()
      if (existingDb) {
        throw new Error('DUPLICATE_REVIEW: Bu ürün için daha önce bir değerlendirme yazdınız.')
      }
    } catch (err: any) {
      if (err.message?.includes('DUPLICATE_REVIEW')) throw err
    }
  }

  // 2. Strict Verified Purchase Rule: Customer must have purchased the item
  const purchase = await verifyCustomerPurchase(user.id, productId)
  if (!purchase.isVerified) {
    throw new Error('NOT_ELIGIBLE: Yalnızca bu ürünü satın almış ve teslim almış olan müşteriler değerlendirme yapabilir.')
  }

  // 3. Validation: Rating 1..5, body length
  const rating = Math.min(5, Math.max(1, Math.round(payload.rating)))
  if (!payload.body || payload.body.trim().length < 5) {
    throw new Error('VALIDATION_ERROR: Değerlendirme yorumu en az 5 karakter olmalıdır.')
  }

  const now = new Date().toISOString()
  const reviewId = `rev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

  // 4. Persist to PostgreSQL if configured
  if (isDatabaseConfigured) {
    try {
      const created = await db.orm.public.Review.create({
        userId: user.id,
        productId,
        orderId: purchase.orderId,
        rating,
        title: payload.title || null,
        body: payload.body.trim(),
        status: 'PENDING',
        isVerifiedBuy: true,
      })

      return {
        id: created.id,
        userId: created.userId,
        userEmail: user.email,
        userName: user.name || user.email.split('@')[0],
        productId: created.productId,
        productName: prod.name,
        productSlug: prod.slug,
        orderId: created.orderId,
        rating: created.rating,
        title: created.title,
        body: created.body,
        status: created.status as ReviewStatusType,
        isVerifiedBuy: created.isVerifiedBuy,
        moderationNote: null,
        createdAt: now,
        updatedAt: now,
      }
    } catch (err) {
      console.warn('[reviews.service] DB review create failed, using fallback:', err)
    }
  }

  // Fallback in-memory
  const newReview: ReviewItem = {
    id: reviewId,
    userId: user.id,
    userEmail: user.email,
    userName: user.name || user.email.split('@')[0],
    productId,
    productName: prod.name,
    productSlug: prod.slug,
    orderId: purchase.orderId,
    rating,
    title: payload.title || null,
    body: payload.body.trim(),
    status: 'PENDING',
    isVerifiedBuy: true,
    moderationNote: null,
    createdAt: now,
    updatedAt: now,
  }

  inMemoryReviews.set(reviewId, newReview)
  return newReview
}

/**
 * Admin: Retrieves all reviews with optional status filter
 */
export async function getAdminReviews(statusFilter?: ReviewStatusType): Promise<ReviewItem[]> {
  if (isDatabaseConfigured) {
    try {
      const query = statusFilter ? { status: statusFilter } : {}
      const records = await db.orm.public.Review.where(query).all()
      if (records && records.length > 0) {
        return records.map((r) => ({
          id: r.id,
          userId: r.userId,
          userEmail: '',
          userName: 'Müşteri',
          productId: r.productId,
          productName: 'Ürün',
          productSlug: '',
          orderId: r.orderId,
          rating: r.rating,
          title: r.title,
          body: r.body,
          status: r.status as ReviewStatusType,
          isVerifiedBuy: r.isVerifiedBuy,
          moderationNote: r.moderationNote,
          createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
          updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : new Date().toISOString(),
        }))
      }
    } catch (err) {
      console.warn('[reviews.service] DB admin reviews fetch failed, using fallback:', err)
    }
  }

  return Array.from(inMemoryReviews.values())
    .filter((r) => !statusFilter || r.status === statusFilter)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

/**
 * Admin: Approves or Rejects a review and logs an audit record
 */
export async function moderateReview(
  adminUserId: string,
  reviewId: string,
  action: 'APPROVE' | 'REJECT',
  moderationNote?: string
): Promise<ReviewItem> {
  const newStatus: ReviewStatusType = action === 'APPROVE' ? 'APPROVED' : 'REJECTED'

  if (isDatabaseConfigured) {
    try {
      await db.orm.public.Review.where({ id: reviewId }).update({
        status: newStatus,
        moderationNote: moderationNote || null,
        updatedAt: new Date(),
      })

      const updated = await db.orm.public.Review.where({ id: reviewId }).first()
      if (updated) {
        await logAuditEvent({
          userId: adminUserId,
          action: `review.${action.toLowerCase()}d`,
          entity: 'Review',
          entityId: reviewId,
          metadata: { newStatus, moderationNote },
        })

        return {
          id: updated.id,
          userId: updated.userId,
          userEmail: '',
          userName: 'Müşteri',
          productId: updated.productId,
          productName: 'Ürün',
          productSlug: '',
          orderId: updated.orderId,
          rating: updated.rating,
          title: updated.title,
          body: updated.body,
          status: updated.status as ReviewStatusType,
          isVerifiedBuy: updated.isVerifiedBuy,
          moderationNote: updated.moderationNote,
          createdAt: updated.createdAt ? new Date(updated.createdAt).toISOString() : new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      }
    } catch (err) {
      console.warn('[reviews.service] DB moderation failed, using fallback:', err)
    }
  }

  const existing = inMemoryReviews.get(reviewId)
  if (!existing) {
    throw new Error('NOT_FOUND: Değerlendirme bulunamadı.')
  }

  const updated: ReviewItem = {
    ...existing,
    status: newStatus,
    moderationNote: moderationNote || null,
    updatedAt: new Date().toISOString(),
  }

  inMemoryReviews.set(reviewId, updated)

  await logAuditEvent({
    userId: adminUserId,
    action: `review.${action.toLowerCase()}d`,
    entity: 'Review',
    entityId: reviewId,
    metadata: { newStatus, moderationNote },
  })

  return updated
}
