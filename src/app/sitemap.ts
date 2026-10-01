import type { MetadataRoute } from 'next'
import { getProducts } from '@/lib/services/products.service'
import { ALL_CATEGORY_SLUGS } from '@/config/categories'
import { ALL_COLLECTION_SLUGS } from '@/config/collections'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://zuulab.com'
  const now = new Date()

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
    ...ALL_CATEGORY_SLUGS.map((slug) => ({
      url: `${baseUrl}/kategori/${slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...ALL_COLLECTION_SLUGS.map((slug) => ({
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

  try {
    const res = await getProducts({ limit: 20 })
    const items = Array.isArray(res) ? res : (res as any).items || []
    for (const p of items) {
      if (p.slug) {
        routes.push({
          url: `${baseUrl}/urun/${p.slug}`,
          lastModified: new Date(p.updatedAt || now),
          changeFrequency: 'weekly',
          priority: 0.8,
        })
      }
    }
  } catch {
    // Graceful fallback to static routes
  }

  return routes
}
