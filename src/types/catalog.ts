/**
 * Storefront catalog shapes, produced from the database by
 * src/lib/services/catalog/catalog.service.ts. Plain JSON (no Dates/Decimals) so
 * they can be cached and passed to client components as-is.
 */

export interface CatalogProduct {
  id: string
  name: string
  slug: string
  /** Same as categorySlug; kept for components that still read it. */
  category?: string
  description: string
  shortDescription: string
  categoryId: string
  categoryName: string
  categorySlug: string
  /** Slugs of the brand collections this product belongs to. */
  collections: string[]
  /** First collection, for components that render a single brand world. */
  collectionWorld?: string
  sku: string
  price: number
  oldPrice?: number
  taxRate: number
  weight: number
  material: string
  /** Texts from Stok ve üretim → Malzemeler for this product's material */
  materialInfo?: { description: string | null; care: string | null }
  /** Outer size in millimetres, from the product form */
  dimensions?: { lengthMm: number | null; widthMm: number | null; heightMm: number | null }
  /** Option definitions, e.g. [{ name: 'Renk', values: ['Kırmızı', 'Mavi'] }] */
  variantOptions?: Array<{ name: string; type?: 'color' | 'text'; values: string[]; swatches?: Record<string, string[]> }>
  productionTime: string
  colors?: string[]
  isFeatured: boolean
  isBestSeller?: boolean
  isNew: boolean
  isActive: boolean
  stock: number
  /** Average of approved reviews; 0 when there are none. */
  rating: number
  /** Number of approved reviews. */
  reviewCount: number
  images: Array<{ url: string; alt: string; isPrimary: boolean }>
  variants?: Array<{
    id: string
    name: string
    value: string
    price?: number
    stock: number
    sku: string
    /** This combination, e.g. { Renk: 'Kırmızı', Boyut: 'M' } */
    options?: Record<string, string>
    /** Photo to show when this combination is chosen */
    imageUrl?: string
  }>
  specifications: Array<{ name: string; value: string }>
  sortOrder?: number
  createdAt?: string
  /** Units sold in paid orders (all channels) */
  soldCount?: number
  /** How many customers have it in their favourites */
  favoriteCount?: number
}

export interface CatalogCategory {
  id: string
  name: string
  slug: string
  description: string
  image: string
  productCount: number
  sortOrder?: number
  parentId?: string | null
  seoTitle?: string | null
  seoDescription?: string | null
  featured?: boolean
  collectionLabel?: string
  collectionWorld?: string
}

export interface CatalogCollection {
  id: string
  slug: string
  name: string
  description: string
  shortDescription: string
  logo: string | null
  heroImage: string | null
  accentColor: string | null
  sortOrder: number
  seoTitle: string | null
  seoDescription: string | null
  productCount: number
}

/** Compact card shape used by listings, search and recommendations. */
export function toProductListItem(p: CatalogProduct) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    price: p.price,
    oldPrice: p.oldPrice ?? null,
    primaryImage: (p.images.find((i) => i.isPrimary) ?? p.images[0])?.url ?? null,
    secondaryImage: p.images[1]?.url ?? null,
    categoryName: p.categoryName,
    categorySlug: p.categorySlug,
    collections: p.collections,
    isFeatured: p.isFeatured,
    isNew: p.isNew,
    inStock: p.stock > 0,
    stockCount: p.stock,
    reviewCount: p.reviewCount,
    avgRating: p.reviewCount > 0 ? p.rating : null,
    discountPercent:
      p.oldPrice && p.oldPrice > p.price ? Math.round(((p.oldPrice - p.price) / p.oldPrice) * 100) : null,
    sku: p.sku,
  }
}

export type ProductListItem = ReturnType<typeof toProductListItem>
