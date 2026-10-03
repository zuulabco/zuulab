import type { Metadata } from 'next'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import { getBestSellers } from '@/lib/services/products.service'
import { getFreeShippingThreshold } from '@/lib/services/settings/store-settings.service'
import { toProductListItem } from '@/types/catalog'
import CartPageClient from './CartPageClient'

export const metadata: Metadata = {
  title: 'Sepetim',
  description: 'zuulab alışveriş sepetinizdeki 3d tasarım ürünlerini inceleyin, kupon uygulayın ve güvenle sipariş verin.',
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function CartPage() {
  const [bestSellers, freeShippingThreshold] = await Promise.all([
    getBestSellers(8),
    getFreeShippingThreshold(),
  ])
  const recommendedProducts = bestSellers.map(toProductListItem)

  return (
    <div className="container" style={{ paddingTop: 'var(--sp-6)', paddingBottom: 'var(--sp-20)' }}>
      <Breadcrumbs items={[{ label: 'sepetim' }]} />
      <CartPageClient
        recommendedProducts={recommendedProducts}
        initialFreeShippingThreshold={freeShippingThreshold}
      />
    </div>
  )
}
