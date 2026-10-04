import { Suspense } from 'react'
import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/seo/metadata'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import ProductCatalogClient, { ProductCatalogStatic } from './ProductCatalogClient'
import { getProducts, getCategories, getCollections } from '@/lib/services/products.service'

export const metadata: Metadata = pageMetadata({
  title: 'Tüm ürünler: 3D baskı lambalar, oyuncaklar ve ev objeleri',
  description:
    'Tüm zuulab ürünleri: zuulight 3D baskı lambalar, zuukids eğitici oyuncaklar, zuulife ev ve masaüstü objeleri ve kişiye özel anahtarlıklar.',
  path: '/urunler',
})

export default async function ProductsPage() {
  const [{ items: products }, categories, collections] = await Promise.all([
    getProducts({ limit: 5000 }),
    getCategories(),
    getCollections(),
  ])

  const catalog = {
    products,
    categories,
    collections,
  }

  return (
    <div
      className="container"
      style={{
        paddingTop: 'var(--sp-6)',
        paddingBottom: 'var(--sp-20)',
      }}
    >
      <Breadcrumbs items={[{ label: 'ürünler' }]} />

      <Suspense fallback={<ProductCatalogStatic {...catalog} />}>
        <ProductCatalogClient {...catalog} />
      </Suspense>
    </div>
  )
}
