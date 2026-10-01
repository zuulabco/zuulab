import type { Metadata } from 'next'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import ReturnRequestClient from './ReturnRequestClient'

interface Context {
  params: Promise<{ orderNumber: string }>
}

export async function generateMetadata({ params }: Context): Promise<Metadata> {
  const { orderNumber } = await params
  return {
    title: `İade & Değişim Talebi #${orderNumber} — Zuulab`,
    description: `Zuulab siparişi için iade ve ürün değişim talebi oluşturma.`,
  }
}

export default async function ReturnRequestPage({ params }: Context) {
  const { orderNumber } = await params
  return (
    <div className="container" style={{ paddingTop: 'var(--sp-8, 32px)', paddingBottom: 'var(--sp-20, 80px)' }}>
      <Breadcrumbs
        items={[
          { label: 'Hesabım', href: '/hesap' },
          { label: 'Siparişlerim', href: '/hesap/siparisler' },
          { label: `#${orderNumber}`, href: `/hesap/siparisler/${orderNumber}` },
          { label: 'İade & Değişim' },
        ]}
      />
      <ReturnRequestClient />
    </div>
  )
}
