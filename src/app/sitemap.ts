import type { MetadataRoute } from 'next'
import { getProducts, getCategories, getCollections } from '@/lib/services/products.service'
import { absoluteUrl } from '@/lib/seo/metadata'
import { CORPORATE_PAGES, LEGAL_DOCS } from '@/lib/legal/documents'

/**
 * sitemap.xml: every indexable storefront URL, from the live catalog.
 *
 * lastmod is only sent where it is real (the product rows' updated_at, and for a
 * listing the newest product in it); Google ignores sitemaps whose dates are all
 * "now". priority and changefreq are left out because Google ignores them.
 * Product photos go in as image entries.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, collections, { items: products }] = await Promise.all([
    getCategories(),
    getCollections(),
    getProducts({ limit: 50000 }),
  ])

  const edited = (p: { updatedAt?: string; createdAt?: string }) => p.updatedAt ?? p.createdAt
  const newest = (list: typeof products): string | undefined =>
    list.map(edited).filter((d): d is string => Boolean(d)).sort().at(-1)
  const catalogUpdated = newest(products)

  const page = (path: string, lastModified?: string): MetadataRoute.Sitemap[number] => ({
    url: absoluteUrl(path),
    ...(lastModified ? { lastModified } : {}),
  })

  return [
    page('/', catalogUpdated),
    page('/urunler', catalogUpdated),
    page('/kategoriler', catalogUpdated),
    page('/koleksiyonlar', catalogUpdated),
    ...categories
      .filter((c) => c.productCount > 0)
      .map((c) => page(`/kategori/${c.slug}`, newest(products.filter((p) => p.categorySlug === c.slug)))),
    ...collections.map((c) => page(`/koleksiyon/${c.slug}`, newest(products.filter((p) => p.collections.includes(c.slug))))),
    ...products.map((p) => ({
      ...page(`/urun/${p.slug}`, edited(p)),
      images: p.images
        .map((img) => img.url)
        .filter((url) => !url.endsWith('/placeholder.png'))
        .slice(0, 10)
        .map((url) => absoluteUrl(url)),
    })),
    ...CORPORATE_PAGES.map((p) => page(`/${p.slug}`)),
    // Each legal document's version date is a real last-modified date
    ...LEGAL_DOCS.map((d) => page(`/${d.slug}`, d.updated)),
  ]
}
