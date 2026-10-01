import { Suspense } from 'react'
import type { Metadata } from 'next'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import ProductCatalogClient, { ProductCatalogSkeleton } from './ProductCatalogClient'
import { getProducts, getCategories } from '@/lib/services/products.service'

export const metadata: Metadata = {
  title: 'ürünler — zuulab',
  description:
    'zuulab tasarım evreni: zuukids, zuulife, zuulight ve zuutoptan 3d baskı koleksiyonları. biyo-bozunur pla ve endüstriyel hassas üretim modelleri.',
}

export default async function ProductsPage() {
  const [{ items: products }, categories] = await Promise.all([
    getProducts({ limit: 100 }),
    getCategories(),
  ])

  return (
    <div
      className="container"
      style={{
        paddingTop: 'var(--sp-6)',
        paddingBottom: 'var(--sp-20)',
      }}
    >
      <Breadcrumbs items={[{ label: 'ürünler' }]} />

      <Suspense fallback={<ProductCatalogSkeleton />}>
        <ProductCatalogClient
          products={products}
          categories={categories}
        />
      </Suspense>
    </div>
  )
}
