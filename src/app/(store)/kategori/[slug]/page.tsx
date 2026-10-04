import { Suspense } from 'react'
import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/seo/metadata'
import { JsonLd, breadcrumbJsonLd, collectionPageJsonLd } from '@/lib/seo/jsonld'
import { notFound, redirect } from 'next/navigation'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import ProductCatalogClient, {
  ProductCatalogStatic,
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
    return { title: 'Kategori bulunamadı', robots: { index: false } }
  }

  return pageMetadata({
    title: category.seoTitle || category.name,
    description:
      category.seoDescription ||
      category.description ||
      `zuulab ${category.name.toLocaleLowerCase('tr-TR')} modelleri: Bolu’da 3D baskıyla tasarlanıp üretilen özgün parçalar.`,
    path: `/kategori/${category.slug}`,
    images: category.image ? [category.image] : undefined,
  })
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

  const catalog = {
    products,
    categories,
    collections,
    initialCategory: category.slug,
    hideHeroIntro: true,
    catalogTitle: category.name.toLocaleLowerCase('tr-TR'),
    catalogDescription: category.description,
  }

  return (
    <>
      <JsonLd
        data={[
          collectionPageJsonLd({
            name: category.name,
            description: category.seoDescription || category.description,
            path: `/kategori/${category.slug}`,
            products,
          }),
          breadcrumbJsonLd([
            { name: 'Ürünler', path: '/urunler' },
            { name: category.name, path: `/kategori/${category.slug}` },
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
              { label: 'ürünler', href: '/urunler' },
              { label: category.name.toLocaleLowerCase('tr-TR') },
            ]}
          />
        </div>

        {/* Compact catalog for this category */}
        <Suspense fallback={<ProductCatalogStatic {...catalog} />}>
          <ProductCatalogClient {...catalog} />
        </Suspense>
      </div>
    </>
  )
}
