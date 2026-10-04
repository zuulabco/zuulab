import { Suspense } from 'react'
import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/seo/metadata'
import { JsonLd, breadcrumbJsonLd, collectionPageJsonLd } from '@/lib/seo/jsonld'
import { notFound } from 'next/navigation'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import ProductCatalogClient, {
  ProductCatalogStatic,
} from '../../urunler/ProductCatalogClient'
import {
  getProductsByCollection,
  getCategories,
  getCollections,
} from '@/lib/services/products.service'
import { getCollectionView } from '@/lib/services/catalog/collection-presentation'

interface PageProps {
  params: Promise<{ slug: string }>
}

// Collections created in admin after the build render on first visit.
export const dynamicParams = true

export async function generateStaticParams() {
  const collections = await getCollections()
  return collections.map((c) => ({ slug: c.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const config = await getCollectionView(slug)

  if (!config) {
    return { title: 'Koleksiyon bulunamadı', robots: { index: false } }
  }

  return pageMetadata({
    title: config.seo.title,
    description: config.seo.description,
    path: `/koleksiyon/${config.slug}`,
    images: config.heroImage.endsWith('/placeholder.png') ? undefined : [{ url: config.heroImage, alt: `${config.name} koleksiyonu` }],
  })
}

export default async function CollectionPage({ params }: PageProps) {
  const { slug } = await params
  const config = await getCollectionView(slug)

  if (!config) {
    notFound()
  }

  // Products belonging to this collection from DB
  const [products, categories, collections] = await Promise.all([
    getProductsByCollection(config.slug),
    getCategories(),
    getCollections(),
  ])

  const catalog = {
    products,
    categories,
    collections,
    initialCollection: config.slug,
    hideHeroIntro: true,
    catalogTitle: config.name,
    catalogDescription: config.tagline,
  }

  return (
    <>
      <JsonLd
        data={[
          collectionPageJsonLd({
            name: config.name,
            description: config.seo.description,
            path: `/koleksiyon/${config.slug}`,
            products,
          }),
          breadcrumbJsonLd([
            { name: 'Koleksiyonlar', path: '/koleksiyonlar' },
            { name: config.name, path: `/koleksiyon/${config.slug}` },
          ]),
        ]}
      />

      <div
        className="container"
        style={{
          paddingTop: 'var(--sp-6)',
          paddingBottom: 'var(--sp-20)',
        }}
      >
        {/* Breadcrumb */}
        <div style={{ marginBottom: 'var(--sp-4)' }}>
          <Breadcrumbs
            items={[
              { label: 'koleksiyonlar', href: '/koleksiyonlar' },
              { label: config.name.toLocaleLowerCase('tr-TR') },
            ]}
          />
        </div>

        {/* Compact catalog for this collection */}
        <Suspense fallback={<ProductCatalogStatic {...catalog} />}>
          <ProductCatalogClient {...catalog} />
        </Suspense>
      </div>
    </>
  )
}
