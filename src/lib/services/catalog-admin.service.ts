import 'server-only'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { type Product, type MockProduct } from '@/lib/mock-data'
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

/**
 * Helper to map DB Product + relations into Product shape
 */
async function mapDbProduct(
  p: any,
  images: any[] = [],
  variants: any[] = [],
  categories: any[] = [],
  productCollections: any[] = []
): Promise<Product> {
  const cat =
    categories.find((c) => c.id === p.categoryId || c.slug === p.categoryId) ||
    Object.values(CATEGORY_CONFIGS).find((c) => c.id === p.categoryId || c.slug === p.categoryId)
  const categoryId = cat ? cat.id : p.categoryId
  const categoryName = cat ? cat.name : p.categoryId
  const categorySlug = cat ? cat.slug : p.categoryId

  const collSlugs = productCollections
    .filter((pc) => pc.productId === p.id)
    .map((pc) => pc.collectionId.replace(/^col-/, ''))

  if (collSlugs.length === 0 && p.collectionId) {
    collSlugs.push(p.collectionId.replace(/^col-/, ''))
  }
  if (collSlugs.length === 0) collSlugs.push('general')

  const prodImages = images
    .filter((img) => img.productId === p.id)
    .map((img) => ({
      url: img.url,
      alt: img.alt || p.name,
      isPrimary: img.isPrimary,
    }))

  if (prodImages.length === 0) {
    prodImages.push({ url: '/placeholder.png', alt: p.name, isPrimary: true })
  }

  const prodVariants = variants
    .filter((v) => v.productId === p.id)
    .map((v) => ({
      id: v.id,
      name: v.name,
      value: v.value,
      price: v.price ? Number(v.price) : Number(p.price),
      stock: v.stock,
      sku: v.sku || `${p.sku}-${v.id}`,
    }))

  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    sku: p.sku,
    description: p.description || '',
    shortDescription: p.shortDescription || '',
    categoryId,
    categoryName,
    categorySlug,
    category: categorySlug,
    collections: collSlugs,
    collectionWorld: (collSlugs[0] || 'general') as any,
    collectionId: p.collectionId,
    price: Number(p.price),
    oldPrice: p.oldPrice ? Number(p.oldPrice) : undefined,
    cost: p.cost ? Number(p.cost) : Math.round(Number(p.price) * 0.35),
    costPrice: p.costPrice ? Number(p.costPrice) : Math.round(Number(p.price) * 0.35),
    taxRate: Number(p.taxRate || 20),
    weight: p.weight ? Number(p.weight) : 0,
    material: p.material || 'PLA Premium',
    productionTime: p.productionTime || '1-3 iş günü',
    isFeatured: Boolean(p.isFeatured || p.featured),
    isBestSeller: Boolean(p.isBestSeller || p.bestSeller),
    isNew: Boolean(p.isNew),
    isActive: p.isActive,
    status: p.isActive ? 'ACTIVE' : 'ARCHIVED',
    stock: p.stock || 0,
    rating: 5.0,
    reviewCount: p.salesCount || 10,
    images: prodImages,
    primaryImage: prodImages.find((i) => i.isPrimary) || prodImages[0],
    variants: prodVariants,
    specifications: [],
  } as Product
}

/**
 * Retrieves catalog products for the admin panel with full metrics and costPrice
 */
export async function adminGetProducts(filters: AdminProductFilter = {}) {
  let list: Product[] = []

  if (isDatabaseConfigured) {
    try {
      const [dbProducts, dbImages, dbVariants, dbCategories, dbProductCollections] = await Promise.all([
        db.orm.public.Product.all(),
        db.orm.public.ProductImage.all(),
        db.orm.public.ProductVariant.all(),
        db.orm.public.Category.all(),
        db.orm.public.ProductCollection.all(),
      ])

      list = await Promise.all(
        dbProducts.map((p) => mapDbProduct(p, dbImages, dbVariants, dbCategories, dbProductCollections))
      )
    } catch (e) {
      console.error('[catalog-admin.service] adminGetProducts DB error:', e)
    }
  }

  // Fallback to memory/seed only if DB empty
  if (list.length === 0) {
    list = [...(await import('@/lib/mock-data')).MOCK_PRODUCTS]
  }

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
  if (isDatabaseConfigured) {
    try {
      const dbProd = await db.orm.public.Product.where({ id }).first()
      if (dbProd) {
        const [images, variants, categories, pcs] = await Promise.all([
          db.orm.public.ProductImage.where({ productId: id }).all(),
          db.orm.public.ProductVariant.where({ productId: id }).all(),
          db.orm.public.Category.all(),
          db.orm.public.ProductCollection.where({ productId: id }).all(),
        ])
        return mapDbProduct(dbProd, images, variants, categories, pcs)
      }
    } catch (e) {
      console.error('[catalog-admin.service] adminGetProductById error:', e)
    }
  }

  return null
}

/**
 * Resolves a category by ID or slug from PostgreSQL or CATEGORY_CONFIGS
 */
export async function findCategoryByIdOrSlug(
  identifier?: string | null
): Promise<{ id: string; name: string; slug: string } | null> {
  if (!identifier || typeof identifier !== 'string') return null
  const trimmed = identifier.trim()
  if (!trimmed) return null

  // 1. Check PostgreSQL categories table if database configured
  if (isDatabaseConfigured) {
    try {
      const byId = await db.orm.public.Category.where({ id: trimmed }).first()
      if (byId) {
        return { id: byId.id, name: byId.name, slug: byId.slug }
      }
      const bySlug = await db.orm.public.Category.where({ slug: trimmed }).first()
      if (bySlug) {
        return { id: bySlug.id, name: bySlug.name, slug: bySlug.slug }
      }
    } catch (e) {
      console.warn('[catalog-admin.service] findCategoryByIdOrSlug DB lookup error:', e)
    }
  }

  // 2. Check static CATEGORY_CONFIGS (fallback / offline)
  const config =
    CATEGORY_CONFIGS[trimmed] ||
    Object.values(CATEGORY_CONFIGS).find(
      (c) => c.id === trimmed || c.slug === trimmed
    )

  if (config) {
    return {
      id: config.id,
      name: config.name,
      slug: config.slug,
    }
  }

  // 3. Check SEED_CATEGORIES (fallback)
  const seedCat = SEED_CATEGORIES.find((c: any) => c.id === trimmed || c.slug === trimmed)
  if (seedCat) {
    return {
      id: seedCat.id,
      name: seedCat.name,
      slug: seedCat.slug,
    }
  }

  return null
}

/**
 * Creates a new product in PostgreSQL catalog
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

  const resolvedCategory = await findCategoryByIdOrSlug(payload.categoryId)
  if (!resolvedCategory) {
    const error: any = new Error(`Geçersiz kategori: '${payload.categoryId}'. Lütfen geçerli bir kategori seçin.`)
    error.statusCode = 400
    error.isValidation = true
    throw error
  }
  const categoryId = resolvedCategory.id
  const collections =
    payload.collections || (payload.collectionId ? [payload.collectionId] : ['zuukids'])
  const primaryCol = collections[0] || 'zuukids'
  const collectionId = primaryCol.startsWith('col-') ? primaryCol : `col-${primaryCol}`

  const cost = payload.costPrice || Math.round(payload.price * 0.35)
  const isActive = payload.status !== 'ARCHIVED' && payload.status !== 'DRAFT'

  if (isDatabaseConfigured) {
    // 1. Insert Product into PostgreSQL
    await db.orm.public.Product.create({
      id,
      name: payload.name,
      slug,
      sku,
      description: payload.description || '',
      shortDescription: payload.shortDescription || '',
      categoryId,
      collectionId,
      price: String(payload.price) as any,
      oldPrice: payload.compareAtPrice ? (String(payload.compareAtPrice) as any) : null,
      cost: String(cost) as any,
      costPrice: String(cost) as any,
      stock: payload.stock || 0,
      lowStockThreshold: payload.lowStockThreshold || 5,
      material: payload.material || 'PLA Premium',
      isFeatured: Boolean(payload.featured),
      featured: Boolean(payload.featured),
      isBestSeller: Boolean(payload.bestSeller),
      bestSeller: Boolean(payload.bestSeller),
      isActive,
      trackInventory: true,
      minimumStock: 0,
      taxRate: '20' as any,
      weight: '150' as any,
    })

    // 2. Insert Image if provided
    const imgUrl = payload.imageUrl || payload.images?.[0]?.url
    if (imgUrl) {
      await db.orm.public.ProductImage.create({
        id: `img-${id}-0`,
        productId: id,
        url: imgUrl,
        alt: payload.name,
        isPrimary: true,
        sortOrder: 0,
        type: 'IMAGE',
      })
    }

    // 3. Insert Product Collections
    for (let i = 0; i < collections.length; i++) {
      const c = collections[i]
      const colFk = c.startsWith('col-') ? c : `col-${c}`
      try {
        await db.orm.public.ProductCollection.create({
          id: `pc-${id}-${c}`,
          productId: id,
          collectionId: colFk,
          sortOrder: i,
        })
      } catch {
        // Safe ignore collection relation conflict
      }
    }

    // 4. Insert Variants if provided
    if (payload.variants && payload.variants.length > 0) {
      for (let i = 0; i < payload.variants.length; i++) {
        const v = payload.variants[i]
        const vPrice = v.priceAdjustment ? payload.price + v.priceAdjustment : payload.price
        await db.orm.public.ProductVariant.create({
          id: `var-${id}-${i}`,
          productId: id,
          name: v.name,
          value: v.value,
          price: String(vPrice) as any,
          stock: v.stock || payload.stock || 0,
          sku: v.sku || `${sku}-${i + 1}`,
          isActive: true,
          sortOrder: i,
        })
      }
    }
  }

  await logAuditEvent({
    action: 'PRODUCT_CREATED',
    entity: 'Product',
    entityId: id,
    metadata: { name: payload.name, sku, adminEmail },
  })

  const created = await adminGetProductById(id)
  return created!
}

/**
 * Updates an existing product in PostgreSQL catalog
 */
export async function adminUpdateProduct(id: string, payload: Partial<AdminProductPayload>, adminEmail = 'system') {
  const existing = await adminGetProductById(id)
  if (!existing) {
    throw new Error('Güncellenecek ürün bulunamadı.')
  }

  const updateFields: any = {}

  if (payload.name !== undefined) updateFields.name = payload.name
  if (payload.slug !== undefined) updateFields.slug = payload.slug
  if (payload.sku !== undefined) updateFields.sku = payload.sku
  if (payload.description !== undefined) updateFields.description = payload.description
  if (payload.shortDescription !== undefined) updateFields.shortDescription = payload.shortDescription
  if (payload.price !== undefined) updateFields.price = String(payload.price)
  if (payload.compareAtPrice !== undefined) updateFields.oldPrice = payload.compareAtPrice ? String(payload.compareAtPrice) : null
  if (payload.costPrice !== undefined) {
    updateFields.cost = String(payload.costPrice)
    updateFields.costPrice = String(payload.costPrice)
  }
  if (payload.stock !== undefined) updateFields.stock = payload.stock
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
  if (payload.status !== undefined) {
    updateFields.isActive = payload.status === 'ACTIVE'
  }
  if (payload.categoryId !== undefined) {
    const resolvedCategory = await findCategoryByIdOrSlug(payload.categoryId)
    if (!resolvedCategory) {
      const error: any = new Error(`Geçersiz kategori: '${payload.categoryId}'. Lütfen geçerli bir kategori seçin.`)
      error.statusCode = 400
      error.isValidation = true
      throw error
    }
    updateFields.categoryId = resolvedCategory.id
  }
  if (payload.collectionId !== undefined) {
    const colId = payload.collectionId
      ? payload.collectionId.startsWith('col-')
        ? payload.collectionId
        : `col-${payload.collectionId}`
      : null
    updateFields.collectionId = colId
  }

  if (isDatabaseConfigured && Object.keys(updateFields).length > 0) {
    await db.orm.public.Product.where({ id }).update(updateFields)

    if (payload.imageUrl) {
      const existingImg = await db.orm.public.ProductImage.where({ productId: id, isPrimary: true }).first()
      if (existingImg) {
        await db.orm.public.ProductImage.where({ id: existingImg.id }).update({ url: payload.imageUrl })
      } else {
        await db.orm.public.ProductImage.create({
          id: `img-${id}-${Date.now()}`,
          productId: id,
          url: payload.imageUrl,
          alt: payload.name || existing.name,
          isPrimary: true,
          sortOrder: 0,
          type: 'IMAGE',
        })
      }
    }
  }

  await logAuditEvent({
    action: 'PRODUCT_UPDATED',
    entity: 'Product',
    entityId: id,
    metadata: { name: payload.name || existing.name, adminEmail },
  })

  const updated = await adminGetProductById(id)
  return updated!
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
 * Retrieves all categories with live calculated product counts from DB
 */
export async function adminGetCategories() {
  if (isDatabaseConfigured) {
    try {
      const [dbCats, dbProds] = await Promise.all([
        db.orm.public.Category.all(),
        db.orm.public.Product.all(),
      ])

      if (dbCats && dbCats.length > 0) {
        return dbCats.map((cat) => {
          const count = dbProds.filter((p) => p.categoryId === cat.id).length
          return {
            id: cat.id,
            name: cat.name,
            slug: cat.slug,
            description: cat.description || '',
            imageUrl: cat.image || '',
            productCount: count,
          }
        })
      }
    } catch (e) {
      console.error('[catalog-admin.service] adminGetCategories error:', e)
    }
  }

  return [...SEED_CATEGORIES].map((cat) => ({ ...cat, productCount: 0 }))
}

/**
 * Retrieves all collections with sort order and live product counts from DB
 */
export async function adminGetCollections() {
  if (isDatabaseConfigured) {
    try {
      const [dbColls, dbProds] = await Promise.all([
        db.orm.public.Collection.all(),
        db.orm.public.Product.all(),
      ])

      if (dbColls && dbColls.length > 0) {
        return dbColls
          .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
          .map((col) => {
            const count = dbProds.filter(
              (p) => p.collectionId === col.id || p.collectionId === `col-${col.slug}`
            ).length
            return {
              id: col.id,
              name: col.name,
              slug: col.slug,
              description: col.description || '',
              shortDescription: col.shortDescription || '',
              logo: col.logo || undefined,
              heroImage: col.heroImage || '',
              accentColor: col.accentColor || '#ffffff',
              status: col.status || 'ACTIVE',
              sortOrder: col.sortOrder || 1,
              productCount: count,
            }
          })
      }
    } catch (e) {
      console.error('[catalog-admin.service] adminGetCollections error:', e)
    }
  }

  return [...SEED_COLLECTIONS].map((col) => ({ ...col, productCount: 0 }))
}

/**
 * Updates collection ordering or details
 */
export async function adminUpdateCollection(
  id: string,
  payload: Partial<typeof SEED_COLLECTIONS[0]>,
  adminEmail = 'system'
) {
  if (isDatabaseConfigured) {
    const updateFields: any = {}
    if (payload.name) updateFields.name = payload.name
    if (payload.description) updateFields.description = payload.description
    if (payload.heroImage) updateFields.heroImage = payload.heroImage
    if (payload.accentColor) updateFields.accentColor = payload.accentColor
    if (payload.sortOrder !== undefined) updateFields.sortOrder = payload.sortOrder

    if (Object.keys(updateFields).length > 0) {
      await db.orm.public.Collection.where({ id }).update(updateFields)
    }
  }

  await logAuditEvent({
    action: 'COLLECTION_UPDATED',
    entity: 'Collection',
    entityId: id,
    metadata: { payload, adminEmail },
  })

  return { id, ...payload }
}

/**
 * Creates a new collection in PostgreSQL
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
    sortOrder: payload.sortOrder || 1,
  }

  if (isDatabaseConfigured) {
    await db.orm.public.Collection.create({
      id: newCol.id,
      name: newCol.name,
      slug: newCol.slug,
      description: newCol.description,
      shortDescription: newCol.shortDescription,
      heroImage: newCol.heroImage,
      accentColor: newCol.accentColor,
      status: 'ACTIVE',
      sortOrder: newCol.sortOrder,
    })
  }

  await logAuditEvent({
    action: 'COLLECTION_CREATED',
    entity: 'Collection',
    entityId: newCol.id,
    metadata: { name: newCol.name, slug: newCol.slug, adminEmail },
  })

  return newCol
}

/**
 * Creates a new category in PostgreSQL
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

  const id = `cat-${Date.now()}`

  if (isDatabaseConfigured) {
    await db.orm.public.Category.create({
      id,
      name: payload.name,
      slug,
      description: payload.description || '',
      image: payload.imageUrl || '',
      isActive: true,
      sortOrder: 0,
    })
  }

  await logAuditEvent({
    action: 'CATEGORY_CREATED',
    entity: 'Category',
    entityId: id,
    metadata: { name: payload.name, slug, adminEmail },
  })

  return {
    id,
    name: payload.name,
    slug,
    description: payload.description || '',
    imageUrl: payload.imageUrl || '',
    productCount: 0,
  }
}

/**
 * Updates an existing category
 */
export async function adminUpdateCategory(
  id: string,
  payload: { name?: string; slug?: string; description?: string; imageUrl?: string },
  adminEmail = 'system'
) {
  if (isDatabaseConfigured) {
    const updateFields: any = {}
    if (payload.name) updateFields.name = payload.name
    if (payload.slug) updateFields.slug = payload.slug
    if (payload.description !== undefined) updateFields.description = payload.description
    if (payload.imageUrl !== undefined) updateFields.image = payload.imageUrl

    if (Object.keys(updateFields).length > 0) {
      await db.orm.public.Category.where({ id }).update(updateFields)
    }
  }

  await logAuditEvent({
    action: 'CATEGORY_UPDATED',
    entity: 'Category',
    entityId: id,
    metadata: { payload, adminEmail },
  })

  return { id, ...payload }
}

/**
 * Deletes a category safely, ensuring it has no attached products
 */
export async function adminDeleteCategory(id: string, adminEmail = 'system') {
  if (isDatabaseConfigured) {
    const attachedProds = await db.orm.public.Product.where({ categoryId: id }).all()
    if (attachedProds.length > 0) {
      throw new Error(
        `Bu kategoriye bağlı ${attachedProds.length} ürün bulunmaktadır. Kategoriyi silmeden önce ürünleri başka bir kategoriye taşıyınız.`
      )
    }

    await db.orm.public.Category.where({ id }).delete()
  }

  await logAuditEvent({
    action: 'CATEGORY_DELETED',
    entity: 'Category',
    entityId: id,
    metadata: { id, adminEmail },
  })

  return { success: true }
}
