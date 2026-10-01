import type { Metadata } from 'next'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import { getBestSellers } from '@/lib/services/products.service'
import { formatMockProductToListItem } from '@/lib/mock-data'
import CartPageClient from './CartPageClient'

export const metadata: Metadata = {
  title: 'sepetim — zuulab',
  description: 'zuulab alışveriş sepetinizdeki 3d tasarım ürünlerini inceleyin, kupon uygulayın ve güvenle sipariş verin.',
}

export default async function CartPage() {
  const bestSellers = await getBestSellers(8)
  const recommendedProducts = bestSellers.map(formatMockProductToListItem)

  return (
    <div className="container" style={{ paddingTop: 'var(--sp-6)', paddingBottom: 'var(--sp-20)' }}>
      <Breadcrumbs items={[{ label: 'sepetim' }]} />
      <CartPageClient recommendedProducts={recommendedProducts} />
    </div>
  )
}
