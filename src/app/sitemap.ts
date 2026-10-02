import type { MetadataRoute } from 'next'
import { getProducts, getCategories, getCollections } from '@/lib/services/products.service'
import { SITE_URL } from '@/lib/config/urls'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = SITE_URL
  const now = new Date()
  // Live catalog only: active categories, collections and products from the database.
  const [categories, collections, { items: products }] = await Promise.all([
    getCategories(),
    getCollections(),
    getProducts({ limit: 50000 }),
  ])

  // Static public storefront routes
  const routes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/urunler`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    ...categories.filter((c) => c.productCount > 0).map(({ slug }) => ({
      url: `${baseUrl}/kategori/${slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...collections.map(({ slug }) => ({
      url: `${baseUrl}/koleksiyon/${slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    {
      url: `${baseUrl}/koleksiyonlar`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.85,
    },
    {
      url: `${baseUrl}/hakkimizda`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/uretim-sureci`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/iletisim`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/iade-politikasi`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/gizlilik-politikasi`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/kullanim-kosullari`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ]

  for (const p of products) {
    routes.push({
      url: `${baseUrl}/urun/${p.slug}`,
      lastModified: p.createdAt ? new Date(p.createdAt) : now,
      changeFrequency: 'weekly',
      priority: 0.8,
    })
  }

  return routes
}
