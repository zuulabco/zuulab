import { Suspense } from 'react'
import type { Metadata } from 'next'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import ProductCatalogClient, { ProductCatalogSkeleton } from './ProductCatalogClient'
import { MOCK_PRODUCTS, MOCK_CATEGORIES } from '@/lib/mock-data'

export const metadata: Metadata = {
  title: 'ürünler — zuulab',
  description:
    'zuulab tasarım evreni: zuukids, zuulife, zuulight ve zuutoptan 3d baskı koleksiyonları. biyo-bozunur pla ve endüstriyel hassas üretim modelleri.',
}

export default function ProductsPage() {
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
          products={MOCK_PRODUCTS}
          categories={MOCK_CATEGORIES}
        />
      </Suspense>
    </div>
  )
}
