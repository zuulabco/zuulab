import type { Metadata } from 'next'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import DestekClient from './DestekClient'

export const metadata: Metadata = {
  title: 'Destek Taleplerim — Zuulab',
  description: 'Siparişleriniz, kargo ve ürün sorularınız için müşteri destek taleplerinizi yönetin.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function DestekPage() {
  return (
    <div className="container" style={{ paddingTop: 'var(--sp-8)', paddingBottom: 'var(--sp-20)' }}>
      <Breadcrumbs
        items={[
          { label: 'Hesabım', href: '/hesap' },
          { label: 'Destek Taleplerim' },
        ]}
      />
      <DestekClient />
    </div>
  )
}
