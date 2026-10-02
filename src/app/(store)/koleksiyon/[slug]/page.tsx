import { Suspense } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import ProductCatalogClient, {
  ProductCatalogSkeleton,
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
    return {
      title: 'koleksiyon bulunamadı — zuulab',
    }
  }

  return {
    title: config.seo.title,
    description: config.seo.description,
    openGraph: {
      title: config.seo.title,
      description: config.seo.description,
      images: [{ url: config.heroImage, alt: `${config.name} koleksiyonu` }],
    },
  }
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

  // JSON-LD structured data for collection page
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'zuulab',
        item: 'https://zuulab.com',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'ürünler',
        item: 'https://zuulab.com/urunler',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: config.name,
        item: `https://zuulab.com/koleksiyon/${config.slug}`,
      },
    ],
  }

  return (
    <>
      {/* Structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
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
              { label: config.name.toLowerCase() },
            ]}
          />
        </div>

        {/* Compact catalog for this collection */}
        <Suspense fallback={<ProductCatalogSkeleton />}>
          <ProductCatalogClient
            products={products}
            categories={categories}
            collections={collections}
            initialCollection={config.slug}
            hideHeroIntro={true}
            catalogTitle={config.name}
            catalogDescription={config.tagline}
          />
        </Suspense>
      </div>
    </>
  )
}
