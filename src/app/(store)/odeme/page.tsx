import type { Metadata } from 'next'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import { getFreeShippingThreshold } from '@/lib/services/settings/store-settings.service'
import { getGeliverConfig } from '@/lib/services/shipping/geliver/geliver.client'
import CheckoutClient from './CheckoutClient'

export const metadata: Metadata = {
  title: 'Güvenli Ödeme',
  description: 'Zuulab 3D baskı siparişinizi tamamlayın. Hızlı kargo, 256-bit SSL güvenli ödeme.',
  robots: {
    index: false,
    follow: false,
  },
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function CheckoutPage() {
  const freeShippingThreshold = await getFreeShippingThreshold()

  return (
    <div className="container" style={{ paddingTop: 'var(--sp-6, 24px)', paddingBottom: 'var(--sp-20, 80px)' }}>
      <Breadcrumbs
        items={[
          { label: 'sepetim', href: '/sepet' },
          { label: 'ödeme' },
        ]}
      />
      {/* Kapıda ödeme is offered only once Geliver (PTT Kargo) is set up to ship it */}
      <CheckoutClient initialFreeShippingThreshold={freeShippingThreshold} cashOnDeliveryEnabled={getGeliverConfig() !== null} />
    </div>
  )
}
