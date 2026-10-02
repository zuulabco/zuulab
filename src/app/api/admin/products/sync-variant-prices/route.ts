import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/services/permissions.service'
import { db, isDatabaseConfigured } from '@/prisma/db'

/**
 * POST /api/admin/products/sync-variant-prices
 *
 * One-shot repair: sets every ProductVariant.price = its parent Product.price.
 * Safe to call multiple times — idempotent.
 * Requires PRODUCT_UPDATE permission.
 */
export async function POST(request: Request) {
  try {
    await requirePermission(request, 'PRODUCT_UPDATE')

    if (!isDatabaseConfigured) {
      return NextResponse.json({ success: false, error: 'Database not configured.' }, { status: 503 })
    }

    const products = await db.orm.public.Product.all()
    const variants = await db.orm.public.ProductVariant.all()

    let synced = 0
    let skipped = 0

    for (const v of variants) {
      const product = products.find((p) => p.id === v.productId)
      if (!product) { skipped++; continue }

      const productPrice = Number(product.price)
      const variantPrice = v.price ? Number(v.price) : null

      if (variantPrice !== productPrice) {
        await db.orm.public.ProductVariant.where({ id: v.id }).update({
          price: String(productPrice) as any,
        })
        synced++
      } else {
        skipped++
      }
    }

    return NextResponse.json({
      success: true,
      message: `Variant price sync complete. Synced: ${synced}, Already correct: ${skipped}`,
      synced,
      skipped,
    })
  } catch (error: any) {
    const isForbidden = error.message?.includes('FORBIDDEN')
    return NextResponse.json(
      { success: false, error: error.message },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
