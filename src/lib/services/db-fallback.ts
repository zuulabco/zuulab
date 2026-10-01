import {
  MOCK_PRODUCTS,
  MOCK_CATEGORIES,
  type MockProduct,
} from '@/lib/mock-data'
import { COLLECTION_CONFIGS } from '@/config/collections'

export interface SeedCollection {
  id: string
  name: string
  slug: string
  description: string
  shortDescription?: string
  logo?: string
  heroImage?: string
  accentColor?: string
  status: string
  sortOrder: number
}

export interface SeedCoupon {
  id: string
  code: string
  type: 'PERCENTAGE' | 'FIXED' | 'FREE_SHIPPING'
  discountValue: number
  minCartAmount?: number
  maxUses?: number
  currentUses: number
  isActive: boolean
}

export const SEED_COLLECTIONS: SeedCollection[] = Object.values(
  COLLECTION_CONFIGS
).map((c, i) => ({
  id: `col-${c.slug}`,
  name: c.name,
  slug: c.slug,
  description: c.description,
  shortDescription: c.tagline,
  logo: c.logo || undefined,
  heroImage: c.heroImage,
  accentColor: c.accentColor,
  status: 'ACTIVE',
  sortOrder: i + 1,
}))

export const SEED_CATEGORIES = MOCK_CATEGORIES.map((cat) => ({
  id: cat.id,
  name: cat.name,
  slug: cat.slug,
  description: cat.description || '',
  imageUrl: cat.image || '',
}))

export const SEED_COUPONS: SeedCoupon[] = [
  {
    id: 'coup-1',
    code: 'ZUULAB10',
    type: 'PERCENTAGE',
    discountValue: 10,
    minCartAmount: 200,
    maxUses: 1000,
    currentUses: 42,
    isActive: true,
  },
  {
    id: 'coup-2',
    code: 'HOSGELDIN50',
    type: 'FIXED',
    discountValue: 50,
    minCartAmount: 300,
    maxUses: 500,
    currentUses: 18,
    isActive: true,
  },
  {
    id: 'coup-3',
    code: 'FREESHIP',
    type: 'FREE_SHIPPING',
    discountValue: 49.9,
    minCartAmount: 250,
    maxUses: 5000,
    currentUses: 110,
    isActive: true,
  },
]
