import 'server-only'
import { normalizeOptions, variantImages } from '@/lib/services/product-variants.service'
import { tidyShortDescription } from '@/lib/utils'
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { db } from '@/prisma/db'
import { dbTimestampToIso } from '@/lib/db/time'
import { CATALOG_TAG } from '@/lib/cache/catalog-cache'
import type { CatalogCategory, CatalogCollection, CatalogProduct } from '@/types/catalog'

/**
 * The storefront catalog, read from Postgres and nothing else.
 *
 * The whole active catalog is loaded as one snapshot and cached under the
 * `catalog` tag. Every admin mutation of products, categories, collections,
 * reviews or stock calls invalidateCatalog() (src/lib/cache/catalog-cache.ts),
 * so the storefront reflects the change on the next request. The time-based
 * revalidate is only a safety net.
 *
 * There is deliberately no mock fallback: if the database is unreachable the
 * loader throws and Next keeps serving the last good page instead of a fake one.
 *
 * One snapshot keeps every listing, filter and search consistent and is cheap at
 * catalog sizes of a few thousand products; past that, move filtering into SQL.
 */

interface CatalogSnapshot {
  products: CatalogProduct[]
  categories: CatalogCategory[]
  collections: CatalogCollection[]
}

/** Uncached loader; exported for tests and scripts. */
/** Stored option definitions with types and swatches filled in; never breaks the catalog */
function safeOptions(raw: unknown) {
  try {
    return normalizeOptions(raw)
  } catch {
    return undefined
  }
}

/**
 * Specifications as shoppers see them. Attributes imported from a marketplace
 * repeat and include compliance fields (producer e-mail, "CE mark: not on the
 * photo"…) that only that marketplace asks for; each name/value is kept once and
 * those are left out.
 */
const MARKETPLACE_ONLY_SPEC = /^(üretici|ithalatçı)\s|ce uygunluk|batarya türü/i

function storefrontSpecs(rows: Array<{ name: string; value: string }>) {
  const seen = new Set<string>()
  const out: Array<{ name: string; value: string }> = []
  for (const { name, value } of rows) {
    const key = `${name}|${value}`.trim().toLocaleLowerCase('tr-TR')
    if (!value?.trim() || MARKETPLACE_ONLY_SPEC.test(name) || seen.has(key)) continue
    seen.add(key)
    out.push({ name, value })
  }
  return out
}

export async function loadSnapshot(): Promise<CatalogSnapshot> {
  const [products, images, variants, specs, categories, collections, links, ratings, sold, favorites, materials] = await Promise.all([
    db.orm.public.Product.where({ isActive: true }).all(),
    db.orm.public.ProductImage.orderBy([(i) => i.sortOrder.asc(), (i) => i.createdAt.asc()]).all(),
    db.orm.public.ProductVariant.where({ isActive: true }).orderBy((v) => v.sortOrder.asc()).all(),
    db.orm.public.ProductSpecification.orderBy((s) => s.sortOrder.asc()).all(),
    db.orm.public.Category.where({ isActive: true }).orderBy((c) => c.sortOrder.asc()).all(),
    db.orm.public.Collection.where({ status: 'ACTIVE' }).orderBy([(c) => c.sortOrder.asc(), (c) => c.name.asc()]).all(),
    db.orm.public.ProductCollection.orderBy((pc) => pc.sortOrder.asc()).all(),
    db.orm.public.Review.where({ status: 'APPROVED' })
      .groupBy('productId')
      .aggregate((a) => ({ count: a.count(), avg: a.avg('rating') })),
    // Units sold in paid orders (storefront and marketplaces), for "best sellers".
    db.runtime().query(
      db.raw.sql`SELECT oi.product_id, SUM(oi.quantity)::int AS qty
        FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.status IN ('PAYMENT_RECEIVED', 'CONFIRMED', 'PREPARING', 'IN_PRODUCTION', 'PACKING', 'SHIPPED', 'DELIVERED')
        GROUP BY oi.product_id`
        .returnsRow({ product_id: 'pg/text@1', qty: 'pg/int4@1' } as never)
        .build()
    ) as unknown as Promise<Array<{ product_id: string; qty: number }>>,
    db.orm.public.Favorite.groupBy('productId').aggregate((a) => ({ count: a.count() })),
    db.orm.public.ProductMaterial.select('name', 'description', 'care').all(),
  ])
  const materialByName = new Map(materials.map((m) => [m.name.toLocaleLowerCase('tr-TR'), m]))

  const group = <T, K>(rows: T[], key: (r: T) => K) => {
    const map = new Map<K, T[]>()
    for (const row of rows) {
      const k = key(row)
      const list = map.get(k)
      if (list) list.push(row)
      else map.set(k, [row])
    }
    return map
  }

  const imagesByProduct = group(images, (i) => i.productId)
  const variantsByProduct = group(variants, (v) => v.productId)
  const specsByProduct = group(specs, (s) => s.productId)
  const linksByProduct = group(links, (l) => l.productId)
  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const collectionById = new Map(collections.map((c) => [c.id, c]))
  const soldByProduct = new Map(sold.map((r) => [r.product_id, Number(r.qty)]))
  const favoritesByProduct = new Map(
    (favorites as Array<{ productId: string; count: number }>).map((f) => [f.productId, Number(f.count)])
  )
  const ratingByProduct = new Map(
    (ratings as Array<{ productId: string; count: number; avg: number | null }>).map((r) => [r.productId, r])
  )

  const catalogProducts: CatalogProduct[] = []
  for (const p of products) {
    const category = categoryById.get(p.categoryId)
    // A product whose category is hidden is hidden with it.
    if (!category) continue

    // The join table is the source of truth; products.collection_id is the legacy
    // single-collection column and only counts when no links exist.
    const linkedIds = (linksByProduct.get(p.id) ?? []).map((l) => l.collectionId)
    const collectionIds = linkedIds.length > 0 ? linkedIds : p.collectionId ? [p.collectionId] : []
    const collectionSlugs = collectionIds
      .map((id) => collectionById.get(id)?.slug)
      .filter((s): s is string => Boolean(s))

    const productImages = (imagesByProduct.get(p.id) ?? []).map((i) => ({
      url: i.url,
      alt: i.alt || p.name,
      isPrimary: i.isPrimary,
    }))
    if (productImages.length === 0) {
      productImages.push({ url: '/placeholder.png', alt: p.name, isPrimary: true })
    } else if (!productImages.some((i) => i.isPrimary)) {
      productImages[0].isPrimary = true
    }

    const rating = ratingByProduct.get(p.id)
    catalogProducts.push({
      id: p.id,
      name: p.name,
      slug: p.slug,
      sku: p.sku,
      description: p.description || '',
      shortDescription: tidyShortDescription(p.shortDescription || '', p.description || ''),
      categoryId: category.id,
      categoryName: category.name,
      categorySlug: category.slug,
      category: category.slug,
      collections: collectionSlugs,
      collectionWorld: collectionSlugs[0],
      price: Number(p.price),
      oldPrice: p.oldPrice !== null && Number(p.oldPrice) > Number(p.price) ? Number(p.oldPrice) : undefined,
      taxRate: Number(p.taxRate ?? 20),
      weight: p.weightGrams ?? (p.weight !== null ? Number(p.weight) : 0),
      material: p.material || '',
      materialInfo: (() => {
        const m = p.material ? materialByName.get(p.material.toLocaleLowerCase('tr-TR')) : undefined
        return m ? { description: m.description ?? null, care: m.care ?? null } : undefined
      })(),
      dimensions:
        p.lengthMm || p.widthMm || p.heightMm
          ? { lengthMm: p.lengthMm ?? null, widthMm: p.widthMm ?? null, heightMm: p.heightMm ?? null }
          : undefined,
      productionTime: p.productionTime || '',
      isFeatured: Boolean(p.isFeatured || p.featured),
      isBestSeller: Boolean(p.isBestSeller || p.bestSeller),
      isNew: Boolean(p.isNew),
      isActive: true,
      // With variants, the product is in stock when any active combination is
      stock: (variantsByProduct.get(p.id) ?? []).length
        ? (variantsByProduct.get(p.id) ?? []).reduce((sum, v) => sum + Math.max(0, v.stock), 0)
        : p.stock,
      variantOptions: Array.isArray(p.variantOptions) ? safeOptions(p.variantOptions) : undefined,
      rating: rating?.avg ? Math.round(Number(rating.avg) * 10) / 10 : 0,
      reviewCount: rating?.count ?? 0,
      images: productImages,
      variants: (variantsByProduct.get(p.id) ?? []).map((v) => ({
        id: v.id,
        name: v.name,
        value: v.value,
        price: v.price !== null ? Number(v.price) : undefined,
        stock: v.stock,
        sku: v.sku || p.sku,
        options: (v.options as Record<string, string> | null) ?? undefined,
        imageUrl: v.imageUrl ?? undefined,
        images: variantImages(v.images, v.imageUrl),
      })),
      specifications: storefrontSpecs(specsByProduct.get(p.id) ?? []),
      sortOrder: p.sortOrder,
      createdAt: dbTimestampToIso(p.createdAt) ?? undefined,
      updatedAt: dbTimestampToIso(p.updatedAt) ?? undefined,
      seoTitle: p.metaTitle?.trim() || null,
      seoDescription: p.metaDesc?.trim() || null,
      barcode: p.barcode?.trim() || null,
      soldCount: soldByProduct.get(p.id) ?? 0,
      favoriteCount: favoritesByProduct.get(p.id) ?? 0,
    })
  }

  const countByCategory = new Map<string, number>()
  const countByCollection = new Map<string, number>()
  for (const p of catalogProducts) {
    countByCategory.set(p.categoryId, (countByCategory.get(p.categoryId) ?? 0) + 1)
    for (const slug of p.collections) countByCollection.set(slug, (countByCollection.get(slug) ?? 0) + 1)
  }

  return {
    products: catalogProducts,
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description || '',
      image: c.image || '',
      productCount: countByCategory.get(c.id) ?? 0,
      sortOrder: c.sortOrder,
      parentId: c.parentId ?? null,
      seoTitle: c.metaTitle ?? null,
      seoDescription: c.metaDesc ?? null,
    })),
    collections: collections.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description || '',
      shortDescription: c.shortDescription || '',
      logo: c.logo ?? null,
      heroImage: c.heroImage ?? null,
      accentColor: c.accentColor ?? null,
      sortOrder: c.sortOrder,
      seoTitle: c.seoTitle ?? null,
      seoDescription: c.seoDescription ?? null,
      productCount: countByCollection.get(c.slug) ?? 0,
    })),
  }
}

const cachedSnapshot = unstable_cache(loadSnapshot, ['catalog-snapshot-v1'], {
  tags: [CATALOG_TAG],
  revalidate: 600,
})

/** Deduplicated per request on top of the cross-request cache. */
export const getCatalogSnapshot = cache(() => cachedSnapshot())

// ─────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────

export interface ProductFilterOptions {
  collectionSlug?: string
  categorySlug?: string
  inStock?: boolean
  minPrice?: number
  maxPrice?: number
  search?: string
  sort?: 'featured' | 'newest' | 'bestseller' | 'favorites' | 'price-asc' | 'price-desc'
  limit?: number
  offset?: number
}

/** Turkish-aware, accent-insensitive normalisation for search. */
export function normalizeSearchText(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function descendantCategoryIds(categories: CatalogCategory[], rootId: string): Set<string> {
  const ids = new Set([rootId])
  let added = true
  while (added) {
    added = false
    for (const c of categories) {
      if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
        ids.add(c.id)
        added = true
      }
    }
  }
  return ids
}

export async function getProducts(options: ProductFilterOptions = {}) {
  const { collectionSlug, categorySlug, inStock, minPrice, maxPrice, search, sort = 'featured', limit = 50, offset = 0 } = options
  const snapshot = await getCatalogSnapshot()
  let list = snapshot.products

  if (collectionSlug && collectionSlug !== 'all') {
    list = list.filter((p) => p.collections.includes(collectionSlug))
  }
  if (categorySlug && categorySlug !== 'all') {
    const root = snapshot.categories.find((c) => c.slug === categorySlug)
    const ids = root ? descendantCategoryIds(snapshot.categories, root.id) : new Set<string>()
    list = list.filter((p) => ids.has(p.categoryId))
  }
  if (inStock) list = list.filter((p) => p.stock > 0)
  if (minPrice !== undefined) list = list.filter((p) => p.price >= minPrice)
  if (maxPrice !== undefined) list = list.filter((p) => p.price <= maxPrice)
  if (search && search.trim()) {
    const terms = normalizeSearchText(search.trim()).split(/\s+/)
    list = list.filter((p) => {
      const haystack = normalizeSearchText(
        [p.name, p.sku, p.material, p.shortDescription, p.categoryName, ...p.collections].join(' ')
      )
      return terms.every((t) => haystack.includes(t))
    })
  }

  const byDefault = (a: CatalogProduct, b: CatalogProduct) =>
    (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
  list = [...list].sort((a, b) => {
    switch (sort) {
      case 'price-asc': return a.price - b.price || byDefault(a, b)
      case 'price-desc': return b.price - a.price || byDefault(a, b)
      case 'newest': return (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
      // Real sales first; the admin's "best seller" flag breaks ties and fills in before any sales exist.
      case 'bestseller':
        return (b.soldCount ?? 0) - (a.soldCount ?? 0) || Number(b.isBestSeller) - Number(a.isBestSeller) || byDefault(a, b)
      case 'favorites':
        return (b.favoriteCount ?? 0) - (a.favoriteCount ?? 0) || b.rating - a.rating || byDefault(a, b)
      default: return Number(b.isFeatured) - Number(a.isFeatured) || byDefault(a, b)
    }
  })

  return { total: list.length, items: list.slice(offset, offset + limit) }
}

export async function getProductBySlug(slug: string): Promise<CatalogProduct | null> {
  const { products } = await getCatalogSnapshot()
  return products.find((p) => p.slug === slug) ?? null
}

export async function getProductById(id: string): Promise<CatalogProduct | null> {
  const { products } = await getCatalogSnapshot()
  return products.find((p) => p.id === id) ?? null
}

export async function getProductsByIds(ids: string[]): Promise<CatalogProduct[]> {
  const { products } = await getCatalogSnapshot()
  const wanted = new Set(ids)
  return products.filter((p) => wanted.has(p.id))
}

export async function getProductsByCollection(collectionSlug: string): Promise<CatalogProduct[]> {
  return (await getProducts({ collectionSlug, limit: 1000 })).items
}

export async function getProductsByCategory(categorySlug: string): Promise<CatalogProduct[]> {
  return (await getProducts({ categorySlug, limit: 1000 })).items
}

export async function getBestSellers(limit = 4): Promise<CatalogProduct[]> {
  return (await getProducts({ sort: 'bestseller', limit })).items
}

export async function getCategories(): Promise<CatalogCategory[]> {
  return (await getCatalogSnapshot()).categories
}

export async function getCategoryBySlug(slug: string): Promise<CatalogCategory | null> {
  return (await getCategories()).find((c) => c.slug === slug) ?? null
}

export async function getCollections(): Promise<CatalogCollection[]> {
  return (await getCatalogSnapshot()).collections
}

export async function getCollectionBySlug(slug: string): Promise<CatalogCollection | null> {
  return (await getCollections()).find((c) => c.slug === slug) ?? null
}
