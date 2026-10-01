// Product-related TypeScript types

export interface ProductListItem {
  id: string
  name: string
  slug: string
  price: number
  oldPrice: number | null
  primaryImage: string | null
  categoryName: string
  categorySlug: string
  isFeatured: boolean
  isNew: boolean
  inStock: boolean
  stockCount: number
  reviewCount: number
  avgRating: number | null
  discountPercent: number | null
  secondaryImage?: string | null
  sku?: string
  collections?: string[]
}

export interface ProductDetail extends ProductListItem {
  description: string | null
  shortDescription: string | null
  sku: string
  taxRate: number
  weight: number | null
  material: string | null
  productionTime: string | null
  videoUrl: string | null
  images: ProductImage[]
  variants: ProductVariant[]
  specifications: ProductSpecification[]
  metaTitle: string | null
  metaDesc: string | null
  metaKeywords: string | null
}

export interface ProductImage {
  id: string
  url: string
  alt: string | null
  sortOrder: number
  isPrimary: boolean
}

export interface ProductVariant {
  id: string
  name: string
  value: string
  sku: string | null
  price: number | null
  stock: number
  isActive: boolean
  sortOrder: number
}

export interface ProductSpecification {
  id: string
  name: string
  value: string
  sortOrder: number
}

export type ProductSortOption =
  | 'newest'
  | 'oldest'
  | 'price_asc'
  | 'price_desc'
  | 'popular'
  | 'rating'

export interface ProductFilters {
  categorySlug?: string
  search?: string
  minPrice?: number
  maxPrice?: number
  inStock?: boolean
  sort?: ProductSortOption
  page?: number
  perPage?: number
}
