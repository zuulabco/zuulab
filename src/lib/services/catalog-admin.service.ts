import 'server-only'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { MOCK_PRODUCTS, type Product } from '@/lib/mock-data'
import { SEED_COLLECTIONS, SEED_CATEGORIES } from './db-fallback'
import { logAuditEvent } from './admin.service'
import { CATEGORY_CONFIGS } from '@/config/categories'

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
  description?: string
  shortDescription?: string
  price: number
  compareAtPrice?: number | null
  costPrice?: number | null
  stock: number
  lowStockThreshold?: number
  collectionId?: string | null
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

// In-memory catalog state
let productsCatalog: Product[] = [...MOCK_PRODUCTS]
let categoriesCatalog = [...SEED_CATEGORIES]
let collectionsCatalog = [...SEED_COLLECTIONS]

/**
 * Retrieves catalog products for the admin panel with full metrics and costPrice
 */
export async function adminGetProducts(filters: AdminProductFilter = {}) {
  let list = [...productsCatalog]

  if (filters.search) {
    const q = filters.search.toLowerCase()
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q)
    )
  }

  if (filters.collection && filters.collection !== 'ALL') {
    list = list.filter(
      (p) =>
        (p as any).collections?.includes(filters.collection) ||
        (p as any).collectionId === filters.collection ||
        p.category === filters.collection
    )
  }

  if (filters.category && filters.category !== 'ALL') {
    list = list.filter(
      (p) => p.categoryId === filters.category || p.categorySlug === filters.category
    )
  }

  if (filters.status && filters.status !== 'ALL') {
    list = list.filter((p) => ((p as any).status || (p.isActive ? 'ACTIVE' : 'ARCHIVED')) === filters.status)
  }

  if (filters.stockLevel) {
    if (filters.stockLevel === 'in_stock') list = list.filter((p) => p.stock > 10)
    else if (filters.stockLevel === 'low_stock') list = list.filter((p) => p.stock > 0 && p.stock <= 10)
    else if (filters.stockLevel === 'out_of_stock') list = list.filter((p) => p.stock <= 0)
  }

  if (filters.featured !== undefined) {
    list = list.filter((p) => p.isFeatured === filters.featured)
  }

  if (filters.bestSeller !== undefined) {
    list = list.filter((p) => p.isBestSeller === filters.bestSeller)
  }

  // Sorting
  if (filters.sort === 'price_asc') {
    list.sort((a, b) => a.price - b.price)
  } else if (filters.sort === 'price_desc') {
    list.sort((a, b) => b.price - a.price)
  } else if (filters.sort === 'stock_asc') {
    list.sort((a, b) => a.stock - b.stock)
  } else if (filters.sort === 'stock_desc') {
    list.sort((a, b) => b.stock - a.stock)
  }

  const total = list.length
  const limit = filters.limit || 50
  const offset = filters.offset || 0

  return {
    total,
    items: list.slice(offset, offset + limit),
  }
}

/**
 * Retrieves a single product by ID with full costPrice for admin
 */
export async function adminGetProductById(id: string): Promise<Product | null> {
  const prod = productsCatalog.find((p) => p.id === id)
  return prod || null
}

/**
 * Creates a new product in the catalog
 */
export async function adminCreateProduct(payload: AdminProductPayload, adminEmail = 'system') {
  const slug =
    payload.slug ||
    payload.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

  const sku = payload.sku || `ZUU-${Math.floor(1000 + Math.random() * 9000)}`
  const id = `prod-${Date.now()}`

  const catConfig =
    CATEGORY_CONFIGS[payload.categoryId] ||
    Object.values(CATEGORY_CONFIGS).find(
      (c) => c.id === payload.categoryId || c.slug === payload.categoryId
    )
  const categoryName = catConfig ? catConfig.name : payload.categoryId
  const categorySlug = catConfig ? catConfig.slug : payload.categoryId
  const collections =
    payload.collections || (payload.collectionId ? [payload.collectionId] : [])

  const newProduct: any = {
    id,
    name: payload.name,
    slug,
    sku,
    description: payload.description || '',
    shortDescription: payload.shortDescription || '',
    price: payload.price,
    oldPrice: payload.compareAtPrice || null,
    cost: payload.costPrice || Math.round(payload.price * 0.35),
    costPrice: payload.costPrice || Math.round(payload.price * 0.35),
    stock: payload.stock || 0,
    lowStockThreshold: payload.lowStockThreshold || 5,
    categoryId: catConfig ? catConfig.id : payload.categoryId,
    categoryName,
    categorySlug,
    collections,
    collectionId: collections[0] || payload.collectionId || null,
    collectionWorld: collections[0] || 'general',
    status: payload.status || 'ACTIVE',
    isActive: payload.status !== 'ARCHIVED' && payload.status !== 'DRAFT',
    material: payload.material || 'PLA Premium',
    isFeatured: !!payload.featured,
    isBestSeller: !!payload.bestSeller,
    images: payload.images || (payload.imageUrl ? [{ url: payload.imageUrl, alt: payload.name, isPrimary: true }] : []),
    primaryImage: payload.imageUrl
      ? { url: payload.imageUrl, alt: payload.name }
      : payload.images?.[0]
      ? { url: payload.images[0].url, alt: payload.name }
      : { url: '/placeholder.png', alt: payload.name },
    variants: payload.variants || [],
  }

  productsCatalog.unshift(newProduct)

  await logAuditEvent({
    action: 'PRODUCT_CREATED',
    entity: 'Product',
    entityId: newProduct.id,
    metadata: { name: newProduct.name, sku: newProduct.sku, adminEmail },
  })

  return newProduct
}

/**
 * Updates an existing product
 */
export async function adminUpdateProduct(id: string, payload: Partial<AdminProductPayload>, adminEmail = 'system') {
  const index = productsCatalog.findIndex((p) => p.id === id)
  if (index === -1) {
    throw new Error('Güncellenecek ürün bulunamadı.')
  }

  const existing = productsCatalog[index]

  let categoryName = existing.categoryName
  let categorySlug = existing.categorySlug
  let categoryId = existing.categoryId

  if (payload.categoryId) {
    const catConfig =
      CATEGORY_CONFIGS[payload.categoryId] ||
      Object.values(CATEGORY_CONFIGS).find(
        (c) => c.id === payload.categoryId || c.slug === payload.categoryId
      )
    if (catConfig) {
      categoryId = catConfig.id
      categoryName = catConfig.name
      categorySlug = catConfig.slug
    } else {
      categoryId = payload.categoryId
      categoryName = payload.categoryId
      categorySlug = payload.categoryId
    }
  }

  const collections =
    payload.collections !== undefined
      ? payload.collections
      : (existing as any).collections || (existing.collectionWorld ? [existing.collectionWorld] : [])

  const updated: any = {
    ...existing,
    ...payload,
    categoryId,
    categoryName,
    categorySlug,
    collections,
    collectionId: collections[0] || payload.collectionId || (existing as any).collectionId || null,
    collectionWorld: collections[0] || (existing as any).collectionWorld || 'general',
    oldPrice: payload.compareAtPrice !== undefined ? payload.compareAtPrice : existing.oldPrice,
    cost: payload.costPrice !== undefined ? payload.costPrice : (existing as any).cost,
    costPrice: payload.costPrice !== undefined ? payload.costPrice : (existing as any).costPrice,
    isFeatured: payload.featured !== undefined ? payload.featured : existing.isFeatured,
    isBestSeller: payload.bestSeller !== undefined ? payload.bestSeller : existing.isBestSeller,
    isActive: payload.status !== undefined ? payload.status === 'ACTIVE' : existing.isActive,
  }

  if (payload.imageUrl) {
    updated.primaryImage = { url: payload.imageUrl, alt: updated.name }
  }

  productsCatalog[index] = updated

  await logAuditEvent({
    action: 'PRODUCT_UPDATED',
    entity: 'Product',
    entityId: id,
    metadata: { name: updated.name, adminEmail },
  })

  return updated
}

/**
 * Duplicates a product with new SKU and unique slug
 */
export async function adminDuplicateProduct(id: string, adminEmail = 'system') {
  const original = await adminGetProductById(id)
  if (!original) throw new Error('Çoğaltılacak ürün bulunamadı.')

  const rand = Math.floor(100 + Math.random() * 900)
  const duplicatedPayload: AdminProductPayload = {
    name: `${original.name} (Kopya)`,
    slug: `${original.slug}-kopya-${rand}`,
    sku: `${original.sku}-COPY-${rand}`,
    description: original.description,
    shortDescription: original.shortDescription,
    price: original.price,
    compareAtPrice: original.oldPrice || null,
    costPrice: (original as any).costPrice || (original as any).cost || null,
    stock: original.stock,
    categoryId: original.categoryId,
    collectionId: (original as any).collectionId || null,
    status: 'DRAFT',
    material: original.material,
    featured: false,
    bestSeller: false,
    imageUrl: (original as any).primaryImage?.url || original.images?.[0]?.url || null,
  }

  const created = await adminCreateProduct(duplicatedPayload, adminEmail)

  await logAuditEvent({
    action: 'PRODUCT_DUPLICATED',
    entity: 'Product',
    entityId: created.id,
    metadata: { sourceId: id, newId: created.id, adminEmail },
  })

  return created
}

/**
 * Archives a product safely without breaking historical orders
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
 * Performs bulk actions on multiple products
 */
export async function adminBulkProductActions(
  ids: string[],
  action: 'activate' | 'archive' | 'set_featured' | 'remove_featured' | 'set_best_seller' | 'remove_best_seller',
  adminEmail = 'system'
) {
  for (const id of ids) {
    if (action === 'activate') await adminUpdateProduct(id, { status: 'ACTIVE' }, adminEmail)
    else if (action === 'archive') await adminUpdateProduct(id, { status: 'ARCHIVED' }, adminEmail)
    else if (action === 'set_featured') await adminUpdateProduct(id, { featured: true }, adminEmail)
    else if (action === 'remove_featured') await adminUpdateProduct(id, { featured: false }, adminEmail)
    else if (action === 'set_best_seller') await adminUpdateProduct(id, { bestSeller: true }, adminEmail)
    else if (action === 'remove_best_seller') await adminUpdateProduct(id, { bestSeller: false }, adminEmail)
  }

  await logAuditEvent({
    action: 'PRODUCT_BULK_UPDATED',
    entity: 'Product',
    metadata: { ids, action, adminEmail },
  })

  return { success: true, count: ids.length }
}

/**
 * Retrieves all categories with calculated product counts
 */
export async function adminGetCategories() {
  return categoriesCatalog.map((cat) => {
    const count = productsCatalog.filter((p) => p.categoryId === cat.id).length
    return {
      ...cat,
      productCount: count,
    }
  })
}

/**
 * Retrieves all collections with SVG logos, sort order, and product counts
 */
export async function adminGetCollections() {
  return collectionsCatalog
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((col) => {
      const count = productsCatalog.filter(
        (p) => (p as any).collectionId === col.id || p.category === col.slug
      ).length
      return {
        ...col,
        productCount: count,
      }
    })
}

/**
 * Updates collection ordering or details
 */
export async function adminUpdateCollection(
  id: string,
  payload: Partial<typeof SEED_COLLECTIONS[0]>,
  adminEmail = 'system'
) {
  const index = collectionsCatalog.findIndex((c) => c.id === id)
  if (index === -1) throw new Error('Koleksiyon bulunamadı.')

  collectionsCatalog[index] = {
    ...collectionsCatalog[index],
    ...payload,
  }

  await logAuditEvent({
    action: 'COLLECTION_UPDATED',
    entity: 'Collection',
    entityId: id,
    metadata: { payload, adminEmail },
  })

  return collectionsCatalog[index]
}

/**
 * Creates a new collection
 */
export async function adminCreateCollection(
  payload: { name: string; slug?: string; description?: string; heroImage?: string; accentColor?: string; sortOrder?: number },
  adminEmail = 'system'
) {
  const slug =
    payload.slug ||
    payload.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

  const newCol = {
    id: `col-${slug}`,
    name: payload.name.toLowerCase(),
    slug,
    description: payload.description || '',
    shortDescription: payload.description || '',
    heroImage: payload.heroImage || '',
    accentColor: payload.accentColor || '#ffffff',
    status: 'ACTIVE',
    sortOrder: payload.sortOrder || collectionsCatalog.length + 1,
  }

  collectionsCatalog.push(newCol as any)

  await logAuditEvent({
    action: 'COLLECTION_CREATED',
    entity: 'Collection',
    entityId: newCol.id,
    metadata: { name: newCol.name, slug: newCol.slug, adminEmail },
  })

  return newCol
}

/**
 * Creates a new category
 */
export async function adminCreateCategory(
  payload: { name: string; slug?: string; description?: string; imageUrl?: string },
  adminEmail = 'system'
) {
  const slug =
    payload.slug ||
    payload.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

  const newCat = {
    id: `cat-${Date.now()}`,
    name: payload.name,
    slug,
    description: payload.description || '',
    imageUrl: payload.imageUrl || '',
    productCount: 0,
  }

  categoriesCatalog.push(newCat as any)

  await logAuditEvent({
    action: 'CATEGORY_CREATED',
    entity: 'Category',
    entityId: newCat.id,
    metadata: { name: newCat.name, slug: newCat.slug, adminEmail },
  })

  return newCat
}

/**
 * Updates an existing category
 */
export async function adminUpdateCategory(
  id: string,
  payload: { name?: string; slug?: string; description?: string; imageUrl?: string },
  adminEmail = 'system'
) {
  const index = categoriesCatalog.findIndex((c) => c.id === id)
  if (index === -1) throw new Error('Kategori bulunamadı.')

  categoriesCatalog[index] = {
    ...categoriesCatalog[index],
    ...payload,
  }

  await logAuditEvent({
    action: 'CATEGORY_UPDATED',
    entity: 'Category',
    entityId: id,
    metadata: { payload, adminEmail },
  })

  return categoriesCatalog[index]
}

/**
 * Deletes a category safely, ensuring it has no attached products
 */
export async function adminDeleteCategory(id: string, adminEmail = 'system') {
  const count = productsCatalog.filter((p) => p.categoryId === id).length
  if (count > 0) {
    throw new Error(
      `Bu kategoriye bağlı ${count} ürün bulunmaktadır. Kategoriyi silmeden önce ürünleri başka bir kategoriye taşıyınız.`
    )
  }

  const index = categoriesCatalog.findIndex((c) => c.id === id)
  if (index === -1) throw new Error('Kategori bulunamadı.')

  const removed = categoriesCatalog.splice(index, 1)[0]

  await logAuditEvent({
    action: 'CATEGORY_DELETED',
    entity: 'Category',
    entityId: id,
    metadata: { name: removed.name, adminEmail },
  })

  return { success: true }
}

