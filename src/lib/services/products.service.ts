import 'server-only'
import { db, isDatabaseConfigured } from '@/prisma/db'
import { MOCK_PRODUCTS, MOCK_CATEGORIES, type MockProduct, type MockCategory } from '@/lib/mock-data'

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


/**
 * Maps database product records and related entities into full storefront Product shape
 */
async function loadFullProductsFromDb(): Promise<MockProduct[]> {
  try {
    const [dbProducts, dbImages, dbVariants, dbCategories, dbCollections, dbProductCollections] = await Promise.all([
      db.orm.public.Product.all(),
      db.orm.public.ProductImage.all(),
      db.orm.public.ProductVariant.all(),
      db.orm.public.Category.all(),
      db.orm.public.Collection.all(),
      db.orm.public.ProductCollection.all(),
    ])

    if (!dbProducts || dbProducts.length === 0) {
      return []
    }

    const imagesByProduct = new Map<string, Array<{ url: string; alt: string; isPrimary: boolean }>>()
    for (const img of dbImages) {
      if (!imagesByProduct.has(img.productId)) imagesByProduct.set(img.productId, [])
      imagesByProduct.get(img.productId)!.push({
        url: img.url,
        alt: img.alt || '',
        isPrimary: img.isPrimary,
      })
    }

    const variantsByProduct = new Map<string, Array<{ id: string; name: string; value: string; price?: number; stock: number; sku: string }>>()
    for (const v of dbVariants) {
      if (!variantsByProduct.has(v.productId)) variantsByProduct.set(v.productId, [])
      variantsByProduct.get(v.productId)!.push({
        id: v.id,
        name: v.name,
        value: v.value,
        price: v.price ? Number(v.price) : undefined,
        stock: v.stock,
        sku: v.sku || '',
      })
    }

    const collsByProduct = new Map<string, string[]>()
    for (const pc of dbProductCollections) {
      if (!collsByProduct.has(pc.productId)) collsByProduct.set(pc.productId, [])
      const colSlug = pc.collectionId.replace(/^col-/, '')
      collsByProduct.get(pc.productId)!.push(colSlug)
    }

    const catsById = new Map<string, any>()
    for (const c of dbCategories) {
      catsById.set(c.id, c)
      catsById.set(c.slug, c)
    }

    return dbProducts.map((p) => {
      const cat = catsById.get(p.categoryId)
      const categoryName = cat ? cat.name : p.categoryId
      const categorySlug = cat ? cat.slug : p.categoryId

      const rawColls = collsByProduct.get(p.id) || (p.collectionId ? [p.collectionId.replace(/^col-/, '')] : ['general'])
      const productColls = rawColls.length > 0 ? rawColls : ['general']
      const collectionWorld = (productColls[0] || 'general') as any

      const images = imagesByProduct.get(p.id) || []
      if (images.length === 0) {
        images.push({ url: '/placeholder.png', alt: p.name, isPrimary: true })
      }

      const variants = variantsByProduct.get(p.id) || []

      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        sku: p.sku,
        description: p.description || '',
        shortDescription: p.shortDescription || '',
        categoryId: p.categoryId,
        categoryName,
        categorySlug,
        category: categorySlug,
        collections: productColls,
        collectionWorld,
        collectionId: p.collectionId,
        price: Number(p.price),
        oldPrice: p.oldPrice ? Number(p.oldPrice) : undefined,
        cost: p.cost ? Number(p.cost) : Math.round(Number(p.price) * 0.35),
        costPrice: p.costPrice ? Number(p.costPrice) : Math.round(Number(p.price) * 0.35),
        taxRate: Number(p.taxRate || 20),
        weight: p.weight ? Number(p.weight) : 0,
        material: p.material || 'PLA',
        productionTime: p.productionTime || '1-3 iş günü',
        isFeatured: Boolean(p.isFeatured || p.featured),
        isBestSeller: Boolean(p.isBestSeller || p.bestSeller),
        isNew: Boolean(p.isNew),
        isActive: p.isActive,
        stock: p.stock || 0,
        rating: 5.0,
        reviewCount: p.salesCount || 10,
        images,
        primaryImage: images.find((i) => i.isPrimary) || images[0],
        variants,
        specifications: [],
      } as MockProduct
    })
  } catch (error) {
    console.error('[products.service] Error loading products from DB:', error)
    return []
  }
}

/**
 * Retrieves products with filtering, search, and sorting.
 * Primary source is PostgreSQL.
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

  let list: MockProduct[] = []

  if (isDatabaseConfigured) {
    list = await loadFullProductsFromDb()
  }

  // Fallback to static mock only if DB is unconfigured or completely empty
  if (list.length === 0) {
    list = [...MOCK_PRODUCTS]
  }

  // Filter only active products for public storefront
  list = list.filter((p) => p.isActive)

  if (collectionSlug && collectionSlug !== 'all') {
    const target = collectionSlug === 'aydinlatma-lamba' ? 'zuulight' : collectionSlug
    list = list.filter(
      (p) => p.collections?.includes(target) || p.collectionWorld === target
    )
  }

  if (categorySlug && categorySlug !== 'all') {
    list = list.filter((p) => p.categorySlug === categorySlug || p.categoryId === categorySlug)
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
        (p.material && p.material.toLowerCase().includes(q)) ||
        (p.shortDescription && p.shortDescription.toLowerCase().includes(q))
    )
  }

  // Sorting
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
 * Retrieves a single product by slug from PostgreSQL
 */
export async function getProductBySlug(slug: string): Promise<MockProduct | null> {
  if (isDatabaseConfigured) {
    try {
      const dbProd = await db.orm.public.Product.where({ slug }).first()
      if (dbProd) {
        const [images, variants, categories, pcs] = await Promise.all([
          db.orm.public.ProductImage.where({ productId: dbProd.id }).all(),
          db.orm.public.ProductVariant.where({ productId: dbProd.id }).all(),
          db.orm.public.Category.all(),
          db.orm.public.ProductCollection.where({ productId: dbProd.id }).all(),
        ])

        const cat = categories.find((c) => c.id === dbProd.categoryId || c.slug === dbProd.categoryId)
        const categoryName = cat ? cat.name : dbProd.categoryId
        const categorySlug = cat ? cat.slug : dbProd.categoryId

        const collections = pcs.map((pc) => pc.collectionId.replace(/^col-/, ''))
        if (collections.length === 0 && dbProd.collectionId) {
          collections.push(dbProd.collectionId.replace(/^col-/, ''))
        }
        if (collections.length === 0) collections.push('general')

        const mappedImages = images.map((i) => ({
          url: i.url,
          alt: i.alt || dbProd.name,
          isPrimary: i.isPrimary,
        }))
        if (mappedImages.length === 0) {
          mappedImages.push({ url: '/placeholder.png', alt: dbProd.name, isPrimary: true })
        }

        const mappedVariants = variants.map((v) => ({
          id: v.id,
          name: v.name,
          value: v.value,
          price: v.price ? Number(v.price) : Number(dbProd.price),
          stock: v.stock,
          sku: v.sku || `${dbProd.sku}-${v.id}`,
        }))

        return {
          id: dbProd.id,
          name: dbProd.name,
          slug: dbProd.slug,
          sku: dbProd.sku,
          description: dbProd.description || '',
          shortDescription: dbProd.shortDescription || '',
          categoryId: dbProd.categoryId,
          categoryName,
          categorySlug,
          category: categorySlug,
          collections,
          collectionWorld: (collections[0] || 'general') as any,
          collectionId: dbProd.collectionId,
          price: Number(dbProd.price),
          oldPrice: dbProd.oldPrice ? Number(dbProd.oldPrice) : undefined,
          cost: dbProd.cost ? Number(dbProd.cost) : Math.round(Number(dbProd.price) * 0.35),
          costPrice: dbProd.costPrice ? Number(dbProd.costPrice) : Math.round(Number(dbProd.price) * 0.35),
          taxRate: Number(dbProd.taxRate || 20),
          weight: dbProd.weight ? Number(dbProd.weight) : 0,
          material: dbProd.material || 'PLA',
          productionTime: dbProd.productionTime || '1-3 iş günü',
          isFeatured: Boolean(dbProd.isFeatured || dbProd.featured),
          isBestSeller: Boolean(dbProd.isBestSeller || dbProd.bestSeller),
          isNew: Boolean(dbProd.isNew),
          isActive: dbProd.isActive,
          stock: dbProd.stock || 0,
          rating: 5.0,
          reviewCount: dbProd.salesCount || 10,
          images: mappedImages,
          variants: mappedVariants,
          specifications: [],
        } as MockProduct
      }
    } catch (e) {
      console.error('[products.service] getProductBySlug DB error:', e)
    }
  }

  // Fallback to static mock
  const found = MOCK_PRODUCTS.find((p) => p.slug === slug)
  return found || null
}

/**
 * Retrieves a single product by ID from PostgreSQL
 */
export async function getProductById(id: string): Promise<MockProduct | null> {
  if (isDatabaseConfigured) {
    try {
      const dbProd = await db.orm.public.Product.where({ id }).first()
      if (dbProd) {
        return getProductBySlug(dbProd.slug)
      }
    } catch (e) {
      console.error('[products.service] getProductById DB error:', e)
    }
  }

  const found = MOCK_PRODUCTS.find((p) => p.id === id)
  return found || null
}

/**
 * Retrieves products belonging to a collection
 */
export async function getProductsByCollection(collectionSlug: string): Promise<MockProduct[]> {
  const result = await getProducts({ collectionSlug, limit: 100 })
  return result.items
}

/**
 * Retrieves products belonging to a category
 */
export async function getProductsByCategory(categorySlug: string): Promise<MockProduct[]> {
  const result = await getProducts({ categorySlug, limit: 100 })
  return result.items
}

/**
 * Retrieves bestseller products
 */
export async function getBestSellers(limit = 4): Promise<MockProduct[]> {
  const result = await getProducts({ sort: 'bestseller', limit })
  return result.items
}

/**
 * Retrieves all categories with live product counts
 */
export async function getCategories(): Promise<MockCategory[]> {
  if (isDatabaseConfigured) {
    try {
      const [dbCats, dbProds] = await Promise.all([
        db.orm.public.Category.all(),
        db.orm.public.Product.all(),
      ])

      if (dbCats && dbCats.length > 0) {
        return dbCats
          .filter((c) => c.isActive)
          .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
          .map((cat) => {
            const count = dbProds.filter((p) => p.isActive && p.categoryId === cat.id).length
            return {
              id: cat.id,
              name: cat.name,
              slug: cat.slug,
              description: cat.description || '',
              image: cat.image || '',
              productCount: count,
              sortOrder: cat.sortOrder,
            }
          })
      }
    } catch (e) {
      console.error('[products.service] getCategories DB error:', e)
    }
  }

  return [...MOCK_CATEGORIES]
}

