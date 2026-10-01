import type { Metadata } from 'next'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import CheckoutClient from './CheckoutClient'

export const metadata: Metadata = {
  title: 'Güvenli Ödeme — Zuulab',
  description: 'Zuulab 3D baskı siparişinizi tamamlayın. Hızlı kargo, 256-bit SSL güvenli ödeme.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function CheckoutPage() {
  return (
    <div className="container" style={{ paddingTop: 'var(--sp-6, 24px)', paddingBottom: 'var(--sp-20, 80px)' }}>
      <Breadcrumbs
        items={[
          { label: 'sepetim', href: '/sepet' },
          { label: 'ödeme' },
        ]}
      />
      <CheckoutClient />
    </div>
  )
}
