import 'server-only'
import { db } from '@/prisma/db'

/**
 * "Gelince haber ver" requests for out-of-stock products. Stored now; sending the
 * back-in-stock email is a later step (notified_at stays empty until then).
 */
export async function createStockAlert(input: {
  productId: string
  variantId?: string | null
  email: string
  userId?: string | null
}): Promise<{ created: boolean }> {
  const email = input.email.trim().toLowerCase()
  const variantId = input.variantId || null

  const product = await db.orm.public.Product.select('id').where({ id: input.productId, isActive: true }).first()
  if (!product) throw new Error('NOT_FOUND: Ürün bulunamadı.')
  if (variantId) {
    const variant = await db.orm.public.ProductVariant.select('id')
      .where({ id: variantId, productId: input.productId })
      .first()
    if (!variant) throw new Error('NOT_FOUND: Ürün seçeneği bulunamadı.')
  }

  // One open request per product/option/email; asking twice is not an error.
  const existing = await db.orm.public.StockAlert.select('id')
    .where({ productId: input.productId, variantId, email, notifiedAt: null })
    .first()
  if (existing) return { created: false }

  await db.orm.public.StockAlert.create({
    productId: input.productId,
    variantId,
    email,
    userId: input.userId ?? null,
  })
  return { created: true }
}
