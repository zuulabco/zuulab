import 'server-only'
import { COLLECTION_CONFIGS, type CollectionConfig } from '@/config/collections'
import type { CatalogCollection } from '@/types/catalog'
import { getCollectionBySlug, getCollections } from './catalog.service'

export type CollectionView = CollectionConfig & { productCount: number; id: string }

/**
 * A collection as the storefront renders it.
 *
 * The database decides which collections exist and are live, and owns everything
 * the admin edits: name, description, hero image, logo, accent colour, SEO and
 * order. src/config/collections.ts only adds the hand-written editorial layer
 * (tagline, pillars, theme, logo sizing) for the brand worlds that have one; a
 * collection created in the admin without such an entry renders with neutral
 * defaults built from its own fields.
 */
export function toCollectionView(c: CatalogCollection): CollectionView {
  const editorial = COLLECTION_CONFIGS[c.slug]
  const description = c.description || editorial?.description || ''
  const short = c.shortDescription || editorial?.tagline || ''

  return {
    id: c.id,
    productCount: c.productCount,
    slug: c.slug,
    name: c.name,
    label: editorial?.label ?? c.name,
    logo: c.logo || editorial?.logo || '',
    logoNeedsDarkBg: editorial?.logoNeedsDarkBg ?? false,
    logoWidth: editorial?.logoWidth ?? 160,
    logoHeight: editorial?.logoHeight ?? 80,
    tagline: editorial?.tagline ?? short,
    editorialTitle: editorial?.editorialTitle ?? short,
    editorialStatement: editorial?.editorialStatement ?? description,
    description,
    heroImage: c.heroImage || editorial?.heroImage || '/placeholder.png',
    secondaryImage: editorial?.secondaryImage,
    accentColor: c.accentColor || editorial?.accentColor || '#70706a',
    theme: editorial?.theme ?? 'editorial',
    pillars: editorial?.pillars ?? [],
    featuredProductSlug: editorial?.featuredProductSlug,
    b2b: editorial?.b2b,
    seo: {
      title: c.seoTitle || editorial?.seo.title || c.name,
      description: c.seoDescription || editorial?.seo.description || description,
    },
  }
}

export async function getCollectionViews(): Promise<CollectionView[]> {
  return (await getCollections()).map(toCollectionView)
}

export async function getCollectionView(slug: string): Promise<CollectionView | null> {
  const c = await getCollectionBySlug(slug)
  return c ? toCollectionView(c) : null
}
