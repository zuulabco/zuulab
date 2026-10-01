import type { Metadata } from 'next'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import OrderDetailClient from './OrderDetailClient'

interface Context {
  params: Promise<{ orderNumber: string }>
}

export async function generateMetadata({ params }: Context): Promise<Metadata> {
  const { orderNumber } = await params
  return {
    title: `Sipariş #${orderNumber} — Zuulab`,
    description: `Zuulab sipariş detayı ve kargo takip bilgileri.`,
  }
}

export default async function OrderDetailPage({ params }: Context) {
  const { orderNumber } = await params
  return (
    <div className="container" style={{ paddingTop: 'var(--sp-8, 32px)', paddingBottom: 'var(--sp-20, 80px)' }}>
      <Breadcrumbs
        items={[
          { label: 'Hesabım', href: '/hesap' },
          { label: 'Siparişlerim', href: '/hesap/siparisler' },
          { label: `#${orderNumber}` },
        ]}
      />
      <OrderDetailClient />
    </div>
  )
}
