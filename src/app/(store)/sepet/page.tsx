import type { Metadata } from 'next'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import { MOCK_PRODUCTS, formatMockProductToListItem } from '@/lib/mock-data'
import CartPageClient from './CartPageClient'

export const metadata: Metadata = {
  title: 'sepetim — zuulab',
  description: 'zuulab alışveriş sepetinizdeki 3d tasarım ürünlerini inceleyin, kupon uygulayın ve güvenle sipariş verin.',
}

export default function CartPage() {
  const recommendedProducts = MOCK_PRODUCTS.filter((p) => p.isFeatured || p.isBestSeller)
    .slice(0, 8)
    .map(formatMockProductToListItem)

  return (
    <div className="container" style={{ paddingTop: 'var(--sp-6)', paddingBottom: 'var(--sp-20)' }}>
      <Breadcrumbs items={[{ label: 'sepetim' }]} />
      <CartPageClient recommendedProducts={recommendedProducts} />
    </div>
  )
}
