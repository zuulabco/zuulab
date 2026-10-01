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
} from '@/lib/services/products.service'
import {
  getCollectionConfig,
  ALL_COLLECTION_SLUGS,
} from '@/config/collections'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  return ALL_COLLECTION_SLUGS.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const config = getCollectionConfig(slug)

  if (!config) {
    return {
      title: 'koleksiyon bulunamadı — zuulab',
    }
  }

  return {
    title: `${config.name} — zuulab`,
    description: config.seo.description,
    openGraph: {
      title: `${config.name} — zuulab`,
      description: config.seo.description,
      images: [{ url: config.heroImage, alt: `${config.name} koleksiyonu` }],
    },
  }
}

export default async function CollectionPage({ params }: PageProps) {
  const { slug } = await params
  const config = getCollectionConfig(slug)

  if (!config) {
    notFound()
  }

  // Products belonging to this collection from DB
  const [products, categories] = await Promise.all([
    getProductsByCollection(config.slug),
    getCategories(),
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
