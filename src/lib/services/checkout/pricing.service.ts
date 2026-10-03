import 'server-only'
import { db } from '@/prisma/db'
import { DEFAULT_VAT_RATE, orderVat, round2 } from '@/lib/pricing/money'
import { calculateShipping, shippingMethodFromSettings } from '../shipping.service'
import { getStoreSettings } from '../settings/store-settings.service'
import { couponProductDiscount, resolveCoupon, type ApplicableCoupon } from '../coupons.service'
import { resolveCartCampaigns, type AppliedCampaign } from '../campaigns.service'

export type ShippingMethodId = 'STANDARD' | 'EXPRESS'

export interface CartItemInput {
  productId: string
  variantId?: string | null
  quantity: number
}

export interface PricedLine {
  productId: string
  variantId: string | null
  name: string
  variantInfo: string | null
  sku: string
  imageUrl: string | null
  unitPrice: number
  quantity: number
  lineTotal: number
  taxRate: number
  availableStock: number
}

export interface CartIssue {
  productId: string
  variantId: string | null
  code: 'UNAVAILABLE' | 'INSUFFICIENT_STOCK' | 'INVALID_QUANTITY'
  available: number
  message: string
}

export interface CartQuote {
  lines: PricedLine[]
  issues: CartIssue[]
  subtotal: number
  /** Campaign discount + coupon discount */
  discountAmount: number
  /** Money off from an automatic store campaign */
  campaignDiscount: number
  /** Money off from the coupon */
  couponDiscount: number
  /** The campaign behind `campaignDiscount`, or a free-shipping campaign */
  campaign: AppliedCampaign | null
  shippingMethod: ShippingMethodId
  shippingAmount: number
  taxAmount: number
  total: number
  freeShippingThreshold: number
  remainingForFreeShipping: number
  coupon: ApplicableCoupon | null
  couponError?: string
}

const MAX_LINE_QUANTITY = 99

/**
 * The single source of truth for what a cart costs. Every price comes from the
 * database; nothing the browser sends except product ids, quantities, the coupon
 * code and the shipping method is trusted.
 *
 * Quantities are never silently changed: a line that cannot be fulfilled is
 * reported in `issues` and checkout refuses the cart until the customer fixes it.
 */
export async function quoteCart(params: {
  items: CartItemInput[]
  couponCode?: string | null
  shippingMethod?: ShippingMethodId
  userId?: string | null
}): Promise<CartQuote> {
  // One delivery method; 'EXPRESS' from older carts is treated as standard
  const shippingMethod: ShippingMethodId = 'STANDARD'
  const merged = mergeItems(params.items)

  const productIds = [...new Set(merged.map((i) => i.productId))]
  const variantIds = [...new Set(merged.map((i) => i.variantId).filter((v): v is string => Boolean(v)))]

  const [products, variants, images] = await Promise.all([
    productIds.length
      ? db.orm.public.Product.where((p) => p.id.in(productIds)).all()
      : Promise.resolve([]),
    variantIds.length
      ? db.orm.public.ProductVariant.where((v) => v.id.in(variantIds)).all()
      : Promise.resolve([]),
    productIds.length
      ? db.orm.public.ProductImage.where((i) => i.productId.in(productIds)).orderBy((i) => i.sortOrder.asc()).all()
      : Promise.resolve([]),
  ])

  const productById = new Map(products.map((p) => [p.id, p]))
  const variantById = new Map(variants.map((v) => [v.id, v]))
  const imageByProduct = new Map<string, string>()
  for (const img of images) {
    if (!imageByProduct.has(img.productId)) imageByProduct.set(img.productId, img.url)
  }

  const lines: PricedLine[] = []
  const issues: CartIssue[] = []
  const categoryOf = new Map(products.map((p) => [p.id, p.categoryId]))

  for (const item of merged) {
    const product = productById.get(item.productId)
    const variant = item.variantId ? variantById.get(item.variantId) : null
    const variantMismatch = item.variantId && (!variant || variant.productId !== item.productId || !variant.isActive)

    if (!product || !product.isActive || variantMismatch) {
      issues.push({
        productId: item.productId,
        variantId: item.variantId,
        code: 'UNAVAILABLE',
        available: 0,
        message: 'Bu ürün artık satışta değil.',
      })
      continue
    }

    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_LINE_QUANTITY) {
      issues.push({
        productId: item.productId,
        variantId: item.variantId,
        code: 'INVALID_QUANTITY',
        available: 0,
        message: `Adet 1 ile ${MAX_LINE_QUANTITY} arasında olmalıdır.`,
      })
      continue
    }

    const availableStock = variant ? variant.stock : product.stock
    if (availableStock < item.quantity) {
      issues.push({
        productId: item.productId,
        variantId: item.variantId,
        code: 'INSUFFICIENT_STOCK',
        available: Math.max(0, availableStock),
        message:
          availableStock > 0
            ? `${product.name} için stokta yalnızca ${availableStock} adet var.`
            : `${product.name} stokta kalmadı.`,
      })
    }

    const unitPrice = round2(Number(variant?.price ?? product.price))
    lines.push({
      productId: product.id,
      variantId: variant?.id ?? null,
      name: product.name,
      variantInfo: variant ? `${variant.name}: ${variant.value}` : null,
      sku: variant?.sku || product.sku,
      imageUrl: imageByProduct.get(product.id) ?? null,
      unitPrice,
      quantity: item.quantity,
      lineTotal: round2(unitPrice * item.quantity),
      taxRate: Number(product.taxRate ?? DEFAULT_VAT_RATE),
      availableStock: Math.max(0, availableStock),
    })
  }

  const subtotal = round2(lines.reduce((sum, l) => sum + l.lineTotal, 0))

  let coupon: ApplicableCoupon | null = null
  let couponError: string | undefined
  if (params.couponCode && params.couponCode.trim()) {
    const resolved = await resolveCoupon({ code: params.couponCode, subtotal, userId: params.userId })
    coupon = resolved.coupon
    couponError = resolved.error
  }

  // Automatic campaign first, then the coupon on what is left
  const campaigns = await resolveCartCampaigns({
    lines: lines.map((l) => ({ lineTotal: l.lineTotal, categoryId: categoryOf.get(l.productId) ?? '' })),
    subtotal,
    userId: params.userId,
  })
  const campaignDiscount = campaigns.discount
  const couponDiscount = coupon ? couponProductDiscount(coupon, round2(subtotal - campaignDiscount)) : 0
  const discountAmount = round2(Math.min(subtotal, campaignDiscount + couponDiscount))
  const settings = await getStoreSettings()
  const freeShippingThreshold = settings.freeShippingThreshold
  const shipping = calculateShipping(
    subtotal,
    coupon?.type === 'FREE_SHIPPING' || Boolean(campaigns.freeShippingCampaign),
    freeShippingThreshold,
    shippingMethodFromSettings(settings.shipping)
  )
  const shippingAmount = lines.length === 0 ? 0 : round2(shipping.shippingFee)
  const total = round2(Math.max(0, subtotal - discountAmount + shippingAmount))

  return {
    lines,
    issues,
    subtotal,
    discountAmount,
    campaignDiscount,
    couponDiscount,
    campaign: campaigns.discountCampaign ?? campaigns.freeShippingCampaign,
    shippingMethod,
    shippingAmount,
    taxAmount: orderVat({ lines, discountAmount, shippingAmount }),
    total,
    freeShippingThreshold,
    remainingForFreeShipping: shipping.remainingForFreeShipping,
    coupon,
    couponError,
  }
}

/** Collapses duplicate product/variant rows the client may send. */
function mergeItems(items: CartItemInput[]): Array<{ productId: string; variantId: string | null; quantity: number }> {
  const merged = new Map<string, { productId: string; variantId: string | null; quantity: number }>()
  for (const item of items) {
    const variantId = item.variantId || null
    const key = `${item.productId}::${variantId ?? ''}`
    const existing = merged.get(key)
    if (existing) existing.quantity += item.quantity
    else merged.set(key, { productId: item.productId, variantId, quantity: item.quantity })
  }
  return [...merged.values()]
}
