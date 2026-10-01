import 'server-only'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { MOCK_PRODUCTS, type MockProduct } from '@/lib/mock-data'
import { SEED_COUPONS } from './db-fallback'

export interface ProductFilterOptions {
  collectionSlug?: string
  categorySlug?: string
  inStock?: boolean
  maxPrice?: number
  search?: string
  sort?: 'featured' | 'newest' | 'bestseller' | 'price-asc' | 'price-desc'
  limit?: number
  offset?: number
}

export interface VerifiedCartItem {
  productId: string
  variantId: string | null
  name: string
  sku: string
  price: number
  quantity: number
  subtotal: number
  imageUrl: string | null
  taxRate: number
  inStock: boolean
}

export interface VerifiedCartSummary {
  items: VerifiedCartItem[]
  subtotal: number
  discountAmount: number
  shippingAmount: number
  totalAmount: number
  freeShippingThreshold: number
  coupon: {
    code: string
    discount: number
    type: string
  } | null
}

import { FREE_SHIPPING_THRESHOLD } from './shipping.service'
const STANDARD_SHIPPING_FEE = 49.9

/**
 * Retrieves products with filtering, search, and sorting
 */
export async function getProducts(options: ProductFilterOptions = {}) {
  const {
    collectionSlug,
    categorySlug,
    inStock = false,
    maxPrice = 10000,
    search = '',
    sort = 'featured',
    limit = 50,
    offset = 0,
  } = options

  // If PostgreSQL is configured and populated
  if (isDatabaseConfigured) {
    try {
      const dbProducts = await db.orm.public.Product.all()
      if (dbProducts && dbProducts.length > 0) {
        // Map and filter from database
        let list = dbProducts.map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          sku: p.sku,
          description: p.description || '',
          shortDescription: p.shortDescription || '',
          price: Number(p.price),
          oldPrice: p.oldPrice ? Number(p.oldPrice) : undefined,
          material: p.material || '',
          productionTime: p.productionTime || '1-3 iş günü',
          isFeatured: p.isFeatured || p.featured || false,
          isBestSeller: p.isBestSeller || p.bestSeller || false,
          isNew: p.isNew || false,
          stock: p.stock || 0,
          categoryId: p.categoryId,
          categoryName: 'genel',
          categorySlug: 'genel',
          taxRate: Number(p.taxRate || 20),
          weight: p.weight ? Number(p.weight) : 0,
          isActive: p.isActive,
          rating: 5.0,
          reviewCount: p.salesCount || 10,
          images: [] as Array<{ url: string; alt: string; isPrimary: boolean }>,
          specifications: [] as Array<{ name: string; value: string }>,
        }))

        // Apply filters
        if (inStock) list = list.filter((p) => p.stock > 0)
        if (maxPrice) list = list.filter((p) => p.price <= maxPrice)
        if (search.trim()) {
          const q = search.toLowerCase()
          list = list.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
        }

        return {
          total: list.length,
          items: list.slice(offset, offset + limit),
        }
      }
    } catch (err) {
      console.warn('[products.service] DB fetch failed, falling back to static seed:', err)
    }
  }

  // Fallback to rich mock data
  let list = [...MOCK_PRODUCTS]

  if (collectionSlug && collectionSlug !== 'all') {
    const target = collectionSlug === 'aydinlatma-lamba' ? 'zuulight' : collectionSlug
    list = list.filter(
      (p) => p.collections?.includes(target) || p.collectionWorld === target
    )
  }

  if (categorySlug && categorySlug !== 'all') {
    list = list.filter((p) => p.categorySlug === categorySlug)
  }

  if (inStock) {
    list = list.filter((p) => p.stock > 0)
  }

  if (maxPrice) {
    list = list.filter((p) => p.price <= maxPrice)
  }

  if (search.trim()) {
    const q = search.toLowerCase().trim()
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.material.toLowerCase().includes(q) ||
        p.shortDescription.toLowerCase().includes(q)
    )
  }

  // Sort
  list.sort((a, b) => {
    if (sort === 'price-asc') return a.price - b.price
    if (sort === 'price-desc') return b.price - a.price
    if (sort === 'newest') return (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0)
    if (sort === 'bestseller') return (b.isBestSeller ? 1 : 0) - (a.isBestSeller ? 1 : 0)
    return (b.isFeatured ? 1 : 0) - (a.isFeatured ? 1 : 0)
  })

  return {
    total: list.length,
    items: list.slice(offset, offset + limit),
  }
}

/**
 * Retrieves a single product by slug
 */
export async function getProductBySlug(slug: string): Promise<MockProduct | null> {
  const found = MOCK_PRODUCTS.find((p) => p.slug === slug)
  return found || null
}

/**
 * Price Security & Cart Verification
 * Never trusts prices submitted by browser. Recalculates everything on server.
 */
export async function verifyAndCalculateCart(
  items: Array<{ productId: string; variantId?: string | null; quantity: number }>,
  couponCode?: string | null
): Promise<VerifiedCartSummary> {
  const verifiedItems: VerifiedCartItem[] = []
  let subtotal = 0

  for (const item of items) {
    const product = MOCK_PRODUCTS.find((p) => p.id === item.productId)
    if (!product) continue

    const variant = item.variantId
      ? product.variants?.find((v) => v.id === item.variantId)
      : null

    const unitPrice = variant?.price ?? product.price
    const maxStock = variant?.stock ?? product.stock
    const validQty = Math.max(1, Math.min(item.quantity, maxStock > 0 ? maxStock : 1))
    const itemSubtotal = unitPrice * validQty

    subtotal += itemSubtotal

    verifiedItems.push({
      productId: product.id,
      variantId: item.variantId || null,
      name: product.name,
      sku: variant?.sku || product.sku,
      price: unitPrice,
      quantity: validQty,
      subtotal: itemSubtotal,
      imageUrl: product.images[0]?.url || null,
      taxRate: product.taxRate || 20,
      inStock: maxStock >= validQty,
    })
  }

  // Calculate Coupon discount server-side
  let discountAmount = 0
  let couponInfo: VerifiedCartSummary['coupon'] = null

  if (couponCode) {
    const cleanCode = couponCode.trim().toUpperCase()
    const foundCoupon = SEED_COUPONS.find(
      (c) => c.code === cleanCode && c.isActive
    )

    if (foundCoupon) {
      if (!foundCoupon.minCartAmount || subtotal >= foundCoupon.minCartAmount) {
        if (foundCoupon.type === 'PERCENTAGE') {
          discountAmount = (subtotal * foundCoupon.discountValue) / 100
        } else if (foundCoupon.type === 'FIXED') {
          discountAmount = Math.min(subtotal, foundCoupon.discountValue)
        } else if (foundCoupon.type === 'FREE_SHIPPING') {
          discountAmount = STANDARD_SHIPPING_FEE
        }

        couponInfo = {
          code: foundCoupon.code,
          discount: discountAmount,
          type: foundCoupon.type,
        }
      }
    }
  }

  // Shipping calculation
  const isFreeShipCoupon = couponInfo?.type === 'FREE_SHIPPING'
  const shippingAmount =
    subtotal >= FREE_SHIPPING_THRESHOLD || subtotal === 0 || isFreeShipCoupon
      ? 0
      : STANDARD_SHIPPING_FEE

  const totalAmount = Math.max(0, subtotal - discountAmount + shippingAmount)

  return {
    items: verifiedItems,
    subtotal,
    discountAmount,
    shippingAmount,
    totalAmount,
    freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
    coupon: couponInfo,
  }
}
