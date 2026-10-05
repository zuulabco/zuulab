import 'server-only'
import { db } from '@/prisma/db'
import { slugify } from '@/lib/utils'
import { dbNumeric } from '@/lib/db/numeric'
import { dbTimestampToIso } from '@/lib/db/time'
import { invalidateCatalog } from '@/lib/cache/catalog-cache'
import type { CatalogProduct } from '@/types/catalog'
import { logAuditEvent } from './admin.service'

/**
 * Admin catalog management. Postgres is the only store: no mock or seed
 * fallbacks, so what the admin sees is exactly what the storefront serves.
 *
 * Every mutation ends with invalidateCatalog(), which expires the storefront
 * catalog cache (and the pages built from it) so the change is visible on the
 * next request.
 *
 * Collection membership lives in product_collections (one product, many
 * collections). products.collection_id is kept in sync as the primary collection
 * for older readers.
 */

export interface AdminProductFilter {
  search?: string
  collection?: string
  category?: string
  status?: string
  stockLevel?: 'all' | 'in_stock' | 'low_stock' | 'out_of_stock'
  featured?: boolean
  bestSeller?: boolean
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'stock_asc' | 'stock_desc'
  limit?: number
  offset?: number
}

export interface AdminProductPayload {
  name: string
  slug?: string
  sku?: string
  barcode?: string | null
  description?: string
  shortDescription?: string
  /** Search result title / description; empty falls back to name and short description */
  seoTitle?: string | null
  seoDescription?: string | null
  price: number
  compareAtPrice?: number | null
  costPrice?: number | null
  stock: number
  lowStockThreshold?: number
  /** Primary collection (slug or id); used when `collections` is not sent. */
  collectionId?: string | null
  /** All collections (slugs or ids); the first one is the primary collection. */
  collections?: string[]
  categoryId: string
  status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED' | 'OUT_OF_STOCK'
  material?: string | null
  featured?: boolean
  bestSeller?: boolean
  imageUrl?: string | null
  images?: Array<{ url: string; alt?: string; isPrimary?: boolean }>
  variants?: Array<{ name: string; value: string; sku?: string; priceAdjustment?: number; stock: number }>
}

export type AdminProduct = CatalogProduct & {
  status: 'ACTIVE' | 'ARCHIVED'
  collectionId: string | null
  cost: number | null
  costPrice: number | null
  lowStockThreshold: number
  primaryImage: { url: string; alt: string; isPrimary: boolean }
}

/** Most photos one product keeps (the product page gallery) */
export const MAX_PRODUCT_IMAGES = 12

/** A product's photos from the admin form: trimmed, without blanks, repeats or the placeholder */
export function cleanImageList(images: Array<{ url: string; alt?: string }>): Array<{ url: string; alt?: string }> {
  if (!Array.isArray(images)) throw new CatalogValidationError('Görsel listesi geçersiz.')
  const seen = new Set<string>()
  const out: Array<{ url: string; alt?: string }> = []
  for (const img of images) {
    const url = typeof img?.url === 'string' ? img.url.trim() : ''
    if (!url || url === '/placeholder.png' || seen.has(url)) continue
    if (!/^(https:\/\/|\/)/.test(url) || url.length > 1000) throw new CatalogValidationError(`Geçersiz görsel adresi: ${url.slice(0, 80)}`)
    seen.add(url)
    out.push({ url, alt: typeof img.alt === 'string' ? img.alt.slice(0, 200) : undefined })
  }
  if (out.length > MAX_PRODUCT_IMAGES) throw new CatalogValidationError(`Bir ürüne en fazla ${MAX_PRODUCT_IMAGES} görsel eklenebilir.`)
  return out
}

class CatalogValidationError extends Error {
  statusCode = 400
  isValidation = true
  constructor(message: string) {
    super(message)
    this.name = 'CatalogValidationError'
  }
}

// ─────────────────────────────────────────────────────────────
// Products: reads
// ─────────────────────────────────────────────────────────────

async function loadAdminProducts(productIds?: string[]): Promise<AdminProduct[]> {
  const products = productIds
    ? await db.orm.public.Product.where((p) => p.id.in(productIds)).all()
    : await db.orm.public.Product.all()
  if (products.length === 0) return []
  const ids = products.map((p) => p.id)

  const [images, variants, categories, collections, links, ratings] = await Promise.all([
    db.orm.public.ProductImage.where((i) => i.productId.in(ids)).orderBy((i) => i.sortOrder.asc()).all(),
    db.orm.public.ProductVariant.where((v) => v.productId.in(ids)).orderBy((v) => v.sortOrder.asc()).all(),
    db.orm.public.Category.all(),
    db.orm.public.Collection.all(),
    db.orm.public.ProductCollection.where((l) => l.productId.in(ids)).orderBy((l) => l.sortOrder.asc()).all(),
    db.orm.public.Review.where({ status: 'APPROVED' })
      .groupBy('productId')
      .aggregate((a) => ({ count: a.count(), avg: a.avg('rating') })),
  ])

  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const collectionById = new Map(collections.map((c) => [c.id, c]))
  const ratingByProduct = new Map(
    (ratings as Array<{ productId: string; count: number; avg: number | null }>).map((r) => [r.productId, r])
  )

  return products.map((p) => {
    const category = categoryById.get(p.categoryId)
    const linkIds = links.filter((l) => l.productId === p.id).map((l) => l.collectionId)
    const collectionIds = linkIds.length > 0 ? linkIds : p.collectionId ? [p.collectionId] : []
    const collectionSlugs = collectionIds
      .map((id) => collectionById.get(id)?.slug)
      .filter((s): s is string => Boolean(s))

    const productImages = images
      .filter((i) => i.productId === p.id)
      .map((i) => ({ url: i.url, alt: i.alt || p.name, isPrimary: i.isPrimary }))
    if (productImages.length === 0) productImages.push({ url: '/placeholder.png', alt: p.name, isPrimary: true })
    const primaryImage = productImages.find((i) => i.isPrimary) ?? productImages[0]

    const rating = ratingByProduct.get(p.id)
    const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))

    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      sku: p.sku,
      description: p.description || '',
      shortDescription: p.shortDescription || '',
      categoryId: p.categoryId,
      categoryName: category?.name ?? p.categoryId,
      categorySlug: category?.slug ?? p.categoryId,
      category: category?.slug ?? p.categoryId,
      collections: collectionSlugs,
      collectionWorld: collectionSlugs[0],
      collectionId: collectionIds[0] ?? null,
      price: Number(p.price),
      oldPrice: num(p.oldPrice) ?? undefined,
      cost: num(p.cost),
      costPrice: num(p.costPrice) ?? num(p.cost),
      taxRate: Number(p.taxRate ?? 20),
      weight: p.weightGrams ?? num(p.weight) ?? 0,
      material: p.material || '',
      productionTime: p.productionTime || '',
      isFeatured: Boolean(p.isFeatured || p.featured),
      isBestSeller: Boolean(p.isBestSeller || p.bestSeller),
      isNew: Boolean(p.isNew),
      isActive: p.isActive,
      status: p.isActive ? 'ACTIVE' : 'ARCHIVED',
      stock: p.stock,
      lowStockThreshold: p.lowStockThreshold,
      rating: rating?.avg ? Math.round(Number(rating.avg) * 10) / 10 : 0,
      reviewCount: rating?.count ?? 0,
      images: productImages,
      primaryImage,
      variants: variants
        .filter((v) => v.productId === p.id)
        .map((v) => ({
          id: v.id,
          name: v.name,
          value: v.value,
          price: num(v.price) ?? Number(p.price),
          stock: v.stock,
          sku: v.sku || p.sku,
        })),
      specifications: [],
      sortOrder: p.sortOrder,
      createdAt: dbTimestampToIso(p.createdAt) ?? undefined,
      updatedAt: dbTimestampToIso(p.updatedAt) ?? undefined,
      barcode: p.barcode ?? null,
      seoTitle: p.metaTitle ?? null,
      seoDescription: p.metaDesc ?? null,
    }
  })
}

/**
 * Retrieves catalog products for the admin panel (all statuses, with cost data)
 */
export async function adminGetProducts(filters: AdminProductFilter = {}) {
  let list = await loadAdminProducts()

  if (filters.search) {
    const q = filters.search.toLocaleLowerCase('tr-TR')
    list = list.filter(
      (p) =>
        p.name.toLocaleLowerCase('tr-TR').includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q)
    )
  }
  if (filters.collection && filters.collection !== 'ALL') {
    const c = filters.collection
    list = list.filter((p) => p.collections.includes(c) || p.collectionId === c)
  }
  if (filters.category && filters.category !== 'ALL') {
    list = list.filter((p) => p.categoryId === filters.category || p.categorySlug === filters.category)
  }
  if (filters.status && filters.status !== 'ALL') {
    list = list.filter((p) => p.status === filters.status)
  }
  if (filters.stockLevel) {
    if (filters.stockLevel === 'in_stock') list = list.filter((p) => p.stock > p.lowStockThreshold)
    else if (filters.stockLevel === 'low_stock') list = list.filter((p) => p.stock > 0 && p.stock <= p.lowStockThreshold)
    else if (filters.stockLevel === 'out_of_stock') list = list.filter((p) => p.stock <= 0)
  }
  if (filters.featured !== undefined) list = list.filter((p) => p.isFeatured === filters.featured)
  if (filters.bestSeller !== undefined) list = list.filter((p) => p.isBestSeller === filters.bestSeller)

  if (filters.sort === 'price_asc') list.sort((a, b) => a.price - b.price)
  else if (filters.sort === 'price_desc') list.sort((a, b) => b.price - a.price)
  else if (filters.sort === 'stock_asc') list.sort((a, b) => a.stock - b.stock)
  else if (filters.sort === 'stock_desc') list.sort((a, b) => b.stock - a.stock)
  else {
    // Default: products on sale first, archived/draft after them; newest first within each.
    const rank = (p: { status: string }) => (p.status === 'ACTIVE' ? 0 : 1)
    list.sort((a, b) => rank(a) - rank(b) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
  }

  const limit = filters.limit || 50
  const offset = filters.offset || 0
  return { total: list.length, items: list.slice(offset, offset + limit) }
}

/**
 * Retrieves a single product by ID with full cost data for admin
 */
export async function adminGetProductById(id: string): Promise<AdminProduct | null> {
  const [product] = await loadAdminProducts([id])
  return product ?? null
}

// ─────────────────────────────────────────────────────────────
// Lookups & helpers
// ─────────────────────────────────────────────────────────────

/**
 * Resolves a category by ID or slug
 */
export async function findCategoryByIdOrSlug(
  identifier?: string | null
): Promise<{ id: string; name: string; slug: string } | null> {
  const trimmed = typeof identifier === 'string' ? identifier.trim() : ''
  if (!trimmed) return null
  const row =
    (await db.orm.public.Category.where({ id: trimmed }).first()) ??
    (await db.orm.public.Category.where({ slug: trimmed }).first())
  return row ? { id: row.id, name: row.name, slug: row.slug } : null
}

/** Maps collection slugs or ids to ids, rejecting unknown ones. */
async function resolveCollectionIds(values: string[]): Promise<string[]> {
  const wanted = [...new Set(values.map((v) => v.trim()).filter(Boolean))]
  if (wanted.length === 0) return []
  const rows = await db.orm.public.Collection.all()
  const ids: string[] = []
  for (const value of wanted) {
    const match = rows.find((c) => c.id === value || c.slug === value)
    if (!match) throw new CatalogValidationError(`Geçersiz koleksiyon: '${value}'.`)
    if (!ids.includes(match.id)) ids.push(match.id)
  }
  return ids
}

/** Makes product_collections exactly `collectionIds` (in order) and mirrors the primary into products.collection_id. */
async function syncProductCollections(productId: string, collectionIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(db.raw.sql`DELETE FROM product_collections WHERE product_id = ${productId}`.affectedCount().build())
    for (let i = 0; i < collectionIds.length; i++) {
      await tx.orm.public.ProductCollection.create({ productId, collectionId: collectionIds[i], sortOrder: i })
    }
    await tx.orm.public.Product.where({ id: productId }).update({ collectionId: collectionIds[0] ?? null })
  })
}

/** Returns `base`, or `base-2`, `base-3`… if taken by another row. */
/**
 * The next automatic SKU: ZL followed by a 4-digit running number (ZL0001, ZL0002…),
 * one above the highest ZL number in use. Used when the SKU field is left empty.
 */
export async function nextProductSku(): Promise<string> {
  const [row] = (await db.runtime().query(
    db.raw.sql`SELECT COALESCE(MAX(substring(sku from '^ZL([0-9]+)$')::int), 0) AS n FROM products`
      .returnsRow({ n: 'pg/int4@1' } as never)
      .build()
  )) as unknown as Array<{ n: number }>
  let n = Number(row?.n ?? 0) + 1
  for (;;) {
    const candidate = `ZL${String(n).padStart(4, '0')}`
    if (!(await db.orm.public.Product.where({ sku: candidate }).first())) return candidate
    n++
  }
}

async function uniqueValue(base: string, taken: (value: string) => Promise<boolean>): Promise<string> {
  let candidate = base
  for (let n = 2; await taken(candidate); n++) candidate = `${base}-${n}`
  return candidate
}

function requireSlug(value: string, label: string): string {
  const slug = slugify(value)
  if (!slug) throw new CatalogValidationError(`${label} için geçerli bir kısa ad (slug) üretilemedi.`)
  return slug
}

function requirePrice(value: unknown, label: string): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) throw new CatalogValidationError(`${label} geçerli bir tutar olmalıdır.`)
  return n
}

// ─────────────────────────────────────────────────────────────
// Products: writes
// ─────────────────────────────────────────────────────────────

/**
 * Creates a new product
 */
export async function adminCreateProduct(payload: AdminProductPayload, adminEmail = 'system') {
  if (!payload.name?.trim()) throw new CatalogValidationError('Ürün adı zorunludur.')
  const price = requirePrice(payload.price, 'Fiyat')

  const category = await findCategoryByIdOrSlug(payload.categoryId)
  if (!category) {
    throw new CatalogValidationError(`Geçersiz kategori: '${payload.categoryId}'. Lütfen geçerli bir kategori seçin.`)
  }
  const collectionIds = await resolveCollectionIds(
    payload.collections ?? (payload.collectionId ? [payload.collectionId] : [])
  )

  const slug = await uniqueValue(requireSlug(payload.slug || payload.name, 'Ürün'), async (s) =>
    Boolean(await db.orm.public.Product.where({ slug: s }).first())
  )
  const sku = payload.sku?.trim()
    ? await uniqueValue(payload.sku.trim().toUpperCase(), async (s) =>
        Boolean(await db.orm.public.Product.where({ sku: s }).first())
      )
    : await nextProductSku()
  const id = `prod-${Date.now()}`
  const cost = payload.costPrice !== undefined && payload.costPrice !== null ? requirePrice(payload.costPrice, 'Maliyet') : null

  await db.transaction(async (tx) => {
    await tx.orm.public.Product.create({
      id,
      name: payload.name.trim(),
      slug,
      sku,
      description: payload.description || '',
      shortDescription: payload.shortDescription || '',
      barcode: payload.barcode?.trim() || null,
      metaTitle: payload.seoTitle?.trim() || null,
      metaDesc: payload.seoDescription?.trim() || null,
      categoryId: category.id,
      collectionId: collectionIds[0] ?? null,
      price: dbNumeric(price),
      oldPrice: payload.compareAtPrice ? dbNumeric(requirePrice(payload.compareAtPrice, 'Eski fiyat')) : null,
      cost: cost !== null ? dbNumeric(cost) : null,
      costPrice: cost !== null ? dbNumeric(cost) : null,
      stock: Math.max(0, Math.floor(Number(payload.stock) || 0)),
      lowStockThreshold: payload.lowStockThreshold ?? 5,
      material: payload.material || null,
      isFeatured: Boolean(payload.featured),
      featured: Boolean(payload.featured),
      isBestSeller: Boolean(payload.bestSeller),
      bestSeller: Boolean(payload.bestSeller),
      isActive: payload.status !== 'ARCHIVED' && payload.status !== 'DRAFT',
      trackInventory: true,
      minimumStock: 0,
      taxRate: dbNumeric(20),
    } as never)

    const images = payload.images?.length
      ? cleanImageList(payload.images)
      : payload.imageUrl
        ? cleanImageList([{ url: payload.imageUrl }])
        : []
    for (let i = 0; i < images.length; i++) {
      await tx.orm.public.ProductImage.create({
        productId: id,
        url: images[i].url,
        alt: images[i].alt || payload.name,
        isPrimary: i === 0,
        sortOrder: i,
        type: 'PRODUCT',
      })
    }

    for (let i = 0; i < collectionIds.length; i++) {
      await tx.orm.public.ProductCollection.create({ productId: id, collectionId: collectionIds[i], sortOrder: i })
    }

    for (let i = 0; i < (payload.variants ?? []).length; i++) {
      const v = payload.variants![i]
      await tx.orm.public.ProductVariant.create({
        productId: id,
        name: v.name,
        value: v.value,
        price: dbNumeric(v.priceAdjustment ? price + v.priceAdjustment : price),
        stock: Math.max(0, Math.floor(Number(v.stock) || 0)),
        sku: v.sku || `${sku}-${i + 1}`,
        isActive: true,
        sortOrder: i,
      })
    }
  })

  invalidateCatalog()
  await logAuditEvent({
    action: 'PRODUCT_CREATED',
    entity: 'Product',
    entityId: id,
    metadata: { name: payload.name, sku, adminEmail },
  })

  return (await adminGetProductById(id))!
}

/**
 * Updates an existing product
 */
export async function adminUpdateProduct(id: string, payload: Partial<AdminProductPayload>, adminEmail = 'system') {
  const existing = await db.orm.public.Product.where({ id }).first()
  if (!existing) {
    throw new Error('Güncellenecek ürün bulunamadı.')
  }

  const updateFields: Record<string, unknown> = {}

  if (payload.name !== undefined) {
    if (!payload.name.trim()) throw new CatalogValidationError('Ürün adı boş olamaz.')
    updateFields.name = payload.name.trim()
  }
  if (payload.slug !== undefined && payload.slug !== existing.slug) {
    const slug = requireSlug(payload.slug, 'Ürün')
    const clash = await db.orm.public.Product.where({ slug }).first()
    if (clash && clash.id !== id) throw new CatalogValidationError(`'${slug}' kısa adı başka bir üründe kullanılıyor.`)
    updateFields.slug = slug
  }
  if (payload.sku !== undefined && payload.sku !== existing.sku) {
    const sku = payload.sku.trim().toUpperCase()
    const clash = await db.orm.public.Product.where({ sku }).first()
    if (clash && clash.id !== id) throw new CatalogValidationError(`'${sku}' SKU'su başka bir üründe kullanılıyor.`)
    updateFields.sku = sku
  }
  if (payload.description !== undefined) updateFields.description = payload.description
  if (payload.shortDescription !== undefined) updateFields.shortDescription = payload.shortDescription
  if (payload.seoTitle !== undefined) updateFields.metaTitle = payload.seoTitle?.trim() || null
  if (payload.seoDescription !== undefined) updateFields.metaDesc = payload.seoDescription?.trim() || null
  if (payload.price !== undefined) updateFields.price = dbNumeric(requirePrice(payload.price, 'Fiyat'))
  if (payload.compareAtPrice !== undefined) {
    updateFields.oldPrice = payload.compareAtPrice ? dbNumeric(requirePrice(payload.compareAtPrice, 'Eski fiyat')) : null
  }
  if (payload.costPrice !== undefined) {
    const cost = payload.costPrice === null ? null : dbNumeric(requirePrice(payload.costPrice, 'Maliyet'))
    updateFields.cost = cost
    updateFields.costPrice = cost
  }
  // Stock is not written here: a form saved after a sale would undo it. Stock changes
  // go through inventory-admin (counted levels / adjustments, with a ledger entry).
  if (payload.barcode !== undefined) updateFields.barcode = payload.barcode?.trim() || null
  if (payload.lowStockThreshold !== undefined) updateFields.lowStockThreshold = payload.lowStockThreshold
  if (payload.material !== undefined) updateFields.material = payload.material
  if (payload.featured !== undefined) {
    updateFields.isFeatured = payload.featured
    updateFields.featured = payload.featured
  }
  if (payload.bestSeller !== undefined) {
    updateFields.isBestSeller = payload.bestSeller
    updateFields.bestSeller = payload.bestSeller
  }
  if (payload.status !== undefined) updateFields.isActive = payload.status === 'ACTIVE'
  if (payload.categoryId !== undefined) {
    const category = await findCategoryByIdOrSlug(payload.categoryId)
    if (!category) {
      throw new CatalogValidationError(`Geçersiz kategori: '${payload.categoryId}'. Lütfen geçerli bir kategori seçin.`)
    }
    updateFields.categoryId = category.id
  }

  // Collections: the full list wins; a lone collectionId replaces the primary only.
  let collectionIds: string[] | null = null
  if (payload.collections !== undefined) {
    collectionIds = await resolveCollectionIds(payload.collections)
  } else if (payload.collectionId !== undefined) {
    collectionIds = payload.collectionId ? await resolveCollectionIds([payload.collectionId]) : []
  }

  if (Object.keys(updateFields).length > 0) {
    await db.orm.public.Product.where({ id }).update(updateFields as never)
  }

  // Variant prices mirror the product price (cart and checkout price variants by it).
  if (payload.price !== undefined) {
    await db.runtime().execute(
      db.raw.sql`UPDATE product_variants SET price = ${Number(payload.price).toFixed(2)}::numeric WHERE product_id = ${id}`.affectedCount().build()
    )
  }

  if (collectionIds !== null) {
    await syncProductCollections(id, collectionIds)
  }

  if (payload.images !== undefined) {
    // The full gallery in display order: the first photo is the cover
    const images = cleanImageList(payload.images)
    const alt = payload.name || existing.name
    await db.transaction(async (tx) => {
      // delete() removes a single row; deleteAndCount() removes every match
      await tx.orm.public.ProductImage.where({ productId: id }).deleteAndCount()
      for (let i = 0; i < images.length; i++) {
        await tx.orm.public.ProductImage.create({
          productId: id,
          url: images[i].url,
          alt: images[i].alt || alt,
          isPrimary: i === 0,
          sortOrder: i,
          type: 'PRODUCT',
        })
      }
    })
  } else if (payload.imageUrl) {
    const primary = await db.orm.public.ProductImage.where({ productId: id, isPrimary: true }).first()
    if (primary) {
      await db.orm.public.ProductImage.where({ id: primary.id }).update({ url: payload.imageUrl })
    } else {
      await db.orm.public.ProductImage.create({
        productId: id,
        url: payload.imageUrl,
        alt: payload.name || existing.name,
        isPrimary: true,
        sortOrder: 0,
        type: 'PRODUCT',
      })
    }
  }

  invalidateCatalog()
  await logAuditEvent({
    action: 'PRODUCT_UPDATED',
    entity: 'Product',
    entityId: id,
    metadata: { name: payload.name || existing.name, fields: Object.keys(payload), adminEmail },
  })

  return (await adminGetProductById(id))!
}

/**
 * Duplicates a product as a DRAFT with a new SKU and slug
 */
export async function adminDuplicateProduct(id: string, adminEmail = 'system') {
  const original = await adminGetProductById(id)
  if (!original) throw new Error('Çoğaltılacak ürün bulunamadı.')

  const created = await adminCreateProduct(
    {
      name: `${original.name} (Kopya)`,
      slug: `${original.slug}-kopya`,
      sku: `${original.sku}-KOPYA`,
      description: original.description,
      shortDescription: original.shortDescription,
      seoTitle: original.seoTitle ?? null,
      seoDescription: original.seoDescription ?? null,
      price: original.price,
      compareAtPrice: original.oldPrice ?? null,
      costPrice: original.costPrice,
      stock: 0,
      categoryId: original.categoryId,
      collections: original.collections,
      status: 'DRAFT',
      material: original.material || null,
      featured: false,
      bestSeller: false,
      images: original.images.filter((i) => i.url !== '/placeholder.png'),
    },
    adminEmail
  )

  await logAuditEvent({
    action: 'PRODUCT_DUPLICATED',
    entity: 'Product',
    entityId: created.id,
    metadata: { sourceId: id, newId: created.id, adminEmail },
  })

  return created
}

/**
 * Archives a product (hidden from the storefront; order history is untouched)
 */
export async function adminArchiveProduct(id: string, adminEmail = 'system') {
  return adminUpdateProduct(id, { status: 'ARCHIVED' }, adminEmail)
}

/**
 * Restores an archived product
 */
export async function adminRestoreProduct(id: string, adminEmail = 'system') {
  return adminUpdateProduct(id, { status: 'ACTIVE' }, adminEmail)
}

/**
 * Deletes a product for good. Only archived products can be deleted (archive first,
 * as a safety step), and never one that was sold or produced: order lines and
 * production orders point at it, and that history must stay readable.
 * Images, variants, specs, collection links, favourites, stock alerts and campaign
 * links go with it (cascade); its reviews and cart lines are removed here.
 */
export async function adminDeleteProduct(id: string, adminEmail = 'system') {
  const existing = await db.orm.public.Product.where({ id }).first()
  if (!existing) throw new Error('Silinecek ürün bulunamadı.')
  if (existing.isActive) {
    throw new CatalogValidationError('Yalnızca arşivdeki ürünler silinebilir. Önce ürünü arşivleyin.')
  }

  const [orders, production] = await Promise.all([
    db.orm.public.OrderItem.where({ productId: id }).aggregate((a) => ({ n: a.count() })),
    db.orm.public.ProductionOrder.where({ productId: id }).aggregate((a) => ({ n: a.count() })),
  ])
  if (orders.n > 0) {
    throw new CatalogValidationError(
      `Bu ürün ${orders.n} sipariş satırında geçiyor; sipariş ve fatura geçmişi bozulmasın diye silinemez. Arşivde kalabilir.`
    )
  }
  if (production.n > 0) {
    throw new CatalogValidationError(
      `Bu ürünün ${production.n} üretim kaydı var; üretim geçmişi korunması için silinemez. Arşivde kalabilir.`
    )
  }

  await db.transaction(async (tx) => {
    await tx.orm.public.Review.where({ productId: id }).deleteAndCount()
    await tx.orm.public.CartItem.where({ productId: id }).deleteAndCount()
    await tx.orm.public.Product.where({ id }).delete()
  })

  invalidateCatalog()
  await logAuditEvent({
    action: 'PRODUCT_DELETED',
    entity: 'Product',
    entityId: id,
    metadata: { name: existing.name, sku: existing.sku, adminEmail },
  })

  return { success: true }
}

/**
 * Performs bulk actions on multiple products
 */
export async function adminBulkProductActions(
  ids: string[],
  action: 'activate' | 'archive' | 'set_featured' | 'remove_featured' | 'set_best_seller' | 'remove_best_seller',
  adminEmail = 'system'
) {
  const patch: Partial<AdminProductPayload> =
    action === 'activate' ? { status: 'ACTIVE' }
    : action === 'archive' ? { status: 'ARCHIVED' }
    : action === 'set_featured' ? { featured: true }
    : action === 'remove_featured' ? { featured: false }
    : action === 'set_best_seller' ? { bestSeller: true }
    : { bestSeller: false }

  for (const id of ids) {
    await adminUpdateProduct(id, patch, adminEmail)
  }

  await logAuditEvent({
    action: 'PRODUCT_BULK_UPDATED',
    entity: 'Product',
    metadata: { ids, action, adminEmail },
  })

  return { success: true, count: ids.length }
}

// ─────────────────────────────────────────────────────────────
// Categories
// ─────────────────────────────────────────────────────────────

export interface AdminCategoryPayload {
  name?: string
  slug?: string
  description?: string
  imageUrl?: string
  isActive?: boolean
  sortOrder?: number
  parentId?: string | null
  seoTitle?: string
  seoDescription?: string
}

/**
 * All categories (active and hidden) with product counts
 */
export async function adminGetCategories() {
  const [categories, products] = await Promise.all([
    db.orm.public.Category.orderBy([(c) => c.sortOrder.asc(), (c) => c.name.asc()]).all(),
    db.orm.public.Product.select('categoryId', 'isActive').all(),
  ])
  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description || '',
    imageUrl: c.image || '',
    isActive: c.isActive,
    sortOrder: c.sortOrder,
    parentId: c.parentId ?? null,
    seoTitle: c.metaTitle || '',
    seoDescription: c.metaDesc || '',
    productCount: products.filter((p) => p.categoryId === c.id).length,
    activeProductCount: products.filter((p) => p.categoryId === c.id && p.isActive).length,
  }))
}

function categoryColumns(payload: AdminCategoryPayload) {
  const out: Record<string, unknown> = {}
  if (payload.name !== undefined) {
    if (!payload.name.trim()) throw new CatalogValidationError('Kategori adı boş olamaz.')
    out.name = payload.name.trim()
  }
  if (payload.description !== undefined) out.description = payload.description.trim() || null
  if (payload.imageUrl !== undefined) out.image = payload.imageUrl.trim() || null
  if (payload.isActive !== undefined) out.isActive = Boolean(payload.isActive)
  if (payload.sortOrder !== undefined) out.sortOrder = Math.floor(Number(payload.sortOrder) || 0)
  if (payload.parentId !== undefined) out.parentId = payload.parentId || null
  if (payload.seoTitle !== undefined) out.metaTitle = payload.seoTitle.trim() || null
  if (payload.seoDescription !== undefined) out.metaDesc = payload.seoDescription.trim() || null
  return out
}

/**
 * Creates a new category
 */
export async function adminCreateCategory(payload: AdminCategoryPayload & { name: string }, adminEmail = 'system') {
  const slug = requireSlug(payload.slug || payload.name, 'Kategori')
  if (await db.orm.public.Category.where({ slug }).first()) {
    throw new CatalogValidationError(`'${slug}' kısa adına sahip bir kategori zaten var.`)
  }
  const last = await db.orm.public.Category.orderBy((c) => c.sortOrder.desc()).first()

  const created = await db.orm.public.Category.create({
    slug,
    isActive: true,
    sortOrder: (last?.sortOrder ?? 0) + 1,
    ...categoryColumns(payload),
  } as never)

  invalidateCatalog()
  await logAuditEvent({
    action: 'CATEGORY_CREATED',
    entity: 'Category',
    entityId: created.id,
    metadata: { name: created.name, slug, adminEmail },
  })

  return (await adminGetCategories()).find((c) => c.id === created.id)!
}

/**
 * Updates an existing category
 */
export async function adminUpdateCategory(id: string, payload: AdminCategoryPayload, adminEmail = 'system') {
  const existing = await db.orm.public.Category.where({ id }).first()
  if (!existing) throw new Error('Kategori bulunamadı.')

  const columns = categoryColumns(payload)
  if (payload.slug !== undefined && payload.slug !== existing.slug) {
    const slug = requireSlug(payload.slug, 'Kategori')
    const clash = await db.orm.public.Category.where({ slug }).first()
    if (clash && clash.id !== id) throw new CatalogValidationError(`'${slug}' kısa adı başka bir kategoride kullanılıyor.`)
    columns.slug = slug
  }
  if (columns.parentId === id) throw new CatalogValidationError('Bir kategori kendisinin alt kategorisi olamaz.')

  if (Object.keys(columns).length > 0) {
    await db.orm.public.Category.where({ id }).update(columns as never)
  }

  invalidateCatalog()
  await logAuditEvent({
    action: 'CATEGORY_UPDATED',
    entity: 'Category',
    entityId: id,
    metadata: { fields: Object.keys(payload), adminEmail },
  })

  return (await adminGetCategories()).find((c) => c.id === id)!
}

/**
 * Deletes a category that has no products and no sub-categories
 */
export async function adminDeleteCategory(id: string, adminEmail = 'system') {
  const attached = await db.orm.public.Product.where({ categoryId: id }).aggregate((a) => ({ n: a.count() }))
  if (attached.n > 0) {
    throw new CatalogValidationError(
      `Bu kategoriye bağlı ${attached.n} ürün bulunmaktadır. Kategoriyi silmeden önce ürünleri başka bir kategoriye taşıyın veya kategoriyi pasife alın.`
    )
  }
  const children = await db.orm.public.Category.where({ parentId: id }).aggregate((a) => ({ n: a.count() }))
  if (children.n > 0) {
    throw new CatalogValidationError('Bu kategorinin alt kategorileri var. Önce onları taşıyın veya silin.')
  }

  await db.orm.public.Category.where({ id }).delete()

  invalidateCatalog()
  await logAuditEvent({
    action: 'CATEGORY_DELETED',
    entity: 'Category',
    entityId: id,
    metadata: { id, adminEmail },
  })

  return { success: true }
}

// ─────────────────────────────────────────────────────────────
// Collections
// ─────────────────────────────────────────────────────────────

export interface AdminCollectionPayload {
  name?: string
  slug?: string
  description?: string
  shortDescription?: string
  logo?: string
  heroImage?: string
  accentColor?: string
  status?: 'ACTIVE' | 'INACTIVE'
  sortOrder?: number
  seoTitle?: string
  seoDescription?: string
}

/**
 * All collections (live and hidden) with product counts
 */
export async function adminGetCollections() {
  const [collections, links] = await Promise.all([
    db.orm.public.Collection.orderBy([(c) => c.sortOrder.asc(), (c) => c.name.asc()]).all(),
    db.orm.public.ProductCollection.select('collectionId').all(),
  ])
  return collections.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description || '',
    shortDescription: c.shortDescription || '',
    logo: c.logo || '',
    heroImage: c.heroImage || '',
    accentColor: c.accentColor || '',
    status: c.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
    sortOrder: c.sortOrder,
    seoTitle: c.seoTitle || '',
    seoDescription: c.seoDescription || '',
    productCount: links.filter((l) => l.collectionId === c.id).length,
  }))
}

function collectionColumns(payload: AdminCollectionPayload) {
  const out: Record<string, unknown> = {}
  const text = (v: string | undefined) => (v === undefined ? undefined : v.trim() || null)
  if (payload.name !== undefined) {
    if (!payload.name.trim()) throw new CatalogValidationError('Koleksiyon adı boş olamaz.')
    out.name = payload.name.trim()
  }
  for (const [key, column] of [
    ['description', 'description'],
    ['shortDescription', 'shortDescription'],
    ['logo', 'logo'],
    ['heroImage', 'heroImage'],
    ['seoTitle', 'seoTitle'],
    ['seoDescription', 'seoDescription'],
  ] as const) {
    const v = text(payload[key])
    if (v !== undefined) out[column] = v
  }
  if (payload.accentColor !== undefined) {
    const color = payload.accentColor.trim()
    if (color && !/^#[0-9a-fA-F]{3,8}$/.test(color)) throw new CatalogValidationError('Vurgu rengi #RRGGBB biçiminde olmalıdır.')
    out.accentColor = color || null
  }
  if (payload.status !== undefined) {
    if (payload.status !== 'ACTIVE' && payload.status !== 'INACTIVE') throw new CatalogValidationError('Geçersiz koleksiyon durumu.')
    out.status = payload.status
  }
  if (payload.sortOrder !== undefined) out.sortOrder = Math.floor(Number(payload.sortOrder) || 0)
  return out
}

/**
 * Creates a new collection
 */
export async function adminCreateCollection(payload: AdminCollectionPayload & { name: string }, adminEmail = 'system') {
  const slug = requireSlug(payload.slug || payload.name, 'Koleksiyon')
  if (await db.orm.public.Collection.where({ slug }).first()) {
    throw new CatalogValidationError(`'${slug}' kısa adına sahip bir koleksiyon zaten var.`)
  }
  if (await db.orm.public.Collection.where({ name: payload.name.trim() }).first()) {
    throw new CatalogValidationError(`'${payload.name.trim()}' adında bir koleksiyon zaten var.`)
  }
  const last = await db.orm.public.Collection.orderBy((c) => c.sortOrder.desc()).first()

  const created = await db.orm.public.Collection.create({
    slug,
    status: 'ACTIVE',
    sortOrder: (last?.sortOrder ?? 0) + 1,
    ...collectionColumns(payload),
  } as never)

  invalidateCatalog()
  await logAuditEvent({
    action: 'COLLECTION_CREATED',
    entity: 'Collection',
    entityId: created.id,
    metadata: { name: created.name, slug, adminEmail },
  })

  return (await adminGetCollections()).find((c) => c.id === created.id)!
}

/**
 * Updates collection details, status or ordering
 */
export async function adminUpdateCollection(id: string, payload: AdminCollectionPayload, adminEmail = 'system') {
  const existing = await db.orm.public.Collection.where({ id }).first()
  if (!existing) throw new Error('Koleksiyon bulunamadı.')

  const columns = collectionColumns(payload)
  if (payload.slug !== undefined && payload.slug !== existing.slug) {
    const slug = requireSlug(payload.slug, 'Koleksiyon')
    const clash = await db.orm.public.Collection.where({ slug }).first()
    if (clash && clash.id !== id) throw new CatalogValidationError(`'${slug}' kısa adı başka bir koleksiyonda kullanılıyor.`)
    columns.slug = slug
  }
  if (columns.name && columns.name !== existing.name) {
    const clash = await db.orm.public.Collection.where({ name: String(columns.name) }).first()
    if (clash && clash.id !== id) throw new CatalogValidationError(`'${columns.name}' adında bir koleksiyon zaten var.`)
  }

  if (Object.keys(columns).length > 0) {
    await db.orm.public.Collection.where({ id }).update(columns as never)
  }

  invalidateCatalog()
  await logAuditEvent({
    action: 'COLLECTION_UPDATED',
    entity: 'Collection',
    entityId: id,
    metadata: { fields: Object.keys(payload), adminEmail },
  })

  return (await adminGetCollections()).find((c) => c.id === id)!
}

/**
 * Deletes a collection that no product belongs to. Collections with products
 * should be set to INACTIVE instead, which hides them without touching products.
 */
export async function adminDeleteCollection(id: string, adminEmail = 'system') {
  const linked = await db.orm.public.ProductCollection.where({ collectionId: id }).aggregate((a) => ({ n: a.count() }))
  const direct = await db.orm.public.Product.where({ collectionId: id }).aggregate((a) => ({ n: a.count() }))
  if (linked.n > 0 || direct.n > 0) {
    throw new CatalogValidationError(
      `Bu koleksiyonda ${Math.max(linked.n, direct.n)} ürün var. Silmek yerine pasife alın veya önce ürünleri çıkarın.`
    )
  }

  await db.orm.public.Collection.where({ id }).delete()

  invalidateCatalog()
  await logAuditEvent({
    action: 'COLLECTION_DELETED',
    entity: 'Collection',
    entityId: id,
    metadata: { id, adminEmail },
  })

  return { success: true }
}
