import { Suspense } from 'react'
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import ProductCatalogClient, {
  ProductCatalogSkeleton,
} from '../../urunler/ProductCatalogClient'
import {
  getProductsByCategory,
  getCategories,
  getCategoryBySlug,
  getCollectionBySlug,
  getCollections,
} from '@/lib/services/products.service'

interface PageProps {
  params: Promise<{ slug: string }>
}

// Categories created in admin after the build render on first visit.
export const dynamicParams = true

export async function generateStaticParams() {
  const categories = await getCategories()
  return categories.map((c) => ({ slug: c.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const category = await getCategoryBySlug(slug)
  if (!category) {
    return { title: 'kategori bulunamadı — zuulab' }
  }

  const title = category.seoTitle || `${category.name} — zuulab`
  const description = category.seoDescription || category.description
  return {
    title,
    description,
    openGraph: { title, description },
  }
}

export default async function CategoryPage({ params }: PageProps) {
  const { slug } = await params

  const category = await getCategoryBySlug(slug)
  if (!category) {
    // Old links used /kategori/<collection>; send them to the collection page.
    if (slug === 'aydinlatma-lamba') redirect('/koleksiyon/zuulight')
    if (await getCollectionBySlug(slug)) redirect(`/koleksiyon/${slug}`)
    notFound()
  }

  // Real category products from DB
  const [products, categories, collections] = await Promise.all([
    getProductsByCategory(category.slug),
    getCategories(),
    getCollections(),
  ])

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
            categories={categories}
            collections={collections}
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
