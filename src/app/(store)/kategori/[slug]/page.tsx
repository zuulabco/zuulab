import { Suspense } from 'react'
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import ProductCatalogClient, {
  ProductCatalogSkeleton,
} from '../../urunler/ProductCatalogClient'
import {
  MOCK_CATEGORIES,
  getProductsByCategory,
} from '@/lib/mock-data'
import {
  getCategoryConfig,
  ALL_CATEGORY_SLUGS,
} from '@/config/categories'
import {
  ALL_COLLECTION_SLUGS,
} from '@/config/collections'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  const categoryParams = ALL_CATEGORY_SLUGS.map((slug) => ({ slug }))
  const collectionParams = ALL_COLLECTION_SLUGS.map((slug) => ({ slug }))
  return [...categoryParams, ...collectionParams, { slug: 'aydinlatma-lamba' }]
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  if (slug === 'aydinlatma-lamba' || ALL_COLLECTION_SLUGS.includes(slug)) {
    return {
      title: 'Yönlendiriliyor... — zuulab',
    }
  }

  const category = getCategoryConfig(slug)
  if (!category) {
    return {
      title: 'kategori bulunamadı — zuulab',
    }
  }

  return {
    title: `${category.name} — zuulab`,
    description: category.seo.description,
    openGraph: {
      title: category.seo.title,
      description: category.seo.description,
    },
  }
}

export default async function CategoryPage({ params }: PageProps) {
  const { slug } = await params

  // Backward compatibility: 301-style redirect collection slugs to /koleksiyon/[slug]
  if (slug === 'aydinlatma-lamba') {
    redirect('/koleksiyon/zuulight')
  }
  if (ALL_COLLECTION_SLUGS.includes(slug)) {
    redirect(`/koleksiyon/${slug}`)
  }

  const category = getCategoryConfig(slug)
  if (!category) {
    notFound()
  }

  // Real category products
  const products = getProductsByCategory(category.slug)

  // JSON-LD structured data for category page
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
        name: category.name,
        item: `https://zuulab.com/kategori/${category.slug}`,
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
              { label: 'ürünler', href: '/urunler' },
              { label: category.name.toLowerCase() },
            ]}
          />
        </div>

        {/* Compact catalog for this category */}
        <Suspense fallback={<ProductCatalogSkeleton />}>
          <ProductCatalogClient
            products={products}
            categories={MOCK_CATEGORIES}
            initialCategory={category.slug}
            hideHeroIntro={true}
            catalogTitle={category.name.toLowerCase()}
            catalogDescription={category.description}
          />
        </Suspense>
      </div>
    </>
  )
}
