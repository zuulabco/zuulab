import type { Metadata } from 'next'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import HesapClient from './HesapClient'

export const metadata: Metadata = {
  title: 'Hesabım',
  description: 'Zuulab müşteri hesabı, sipariş geçmişi ve profil yönetimi.',
  robots: { index: false, follow: true },
}

export default function AccountPage() {
  return (
    <div className="container" style={{ paddingTop: 'var(--sp-8, 32px)', paddingBottom: 'var(--sp-20, 80px)' }}>
      <Breadcrumbs items={[{ label: 'Hesabım' }]} />
      <HesapClient />
    </div>
  )
}
