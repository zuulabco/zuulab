import type { Metadata } from 'next'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import AdreslerClient from './AdreslerClient'

export const metadata: Metadata = {
  title: 'Adreslerim',
  description: 'Zuulab kayıtlı teslimat ve fatura adreslerinizi yönetin.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function AdreslerPage() {
  return (
    <div className="container" style={{ paddingTop: 'var(--sp-8)', paddingBottom: 'var(--sp-20)' }}>
      <Breadcrumbs
        items={[
          { label: 'Hesabım', href: '/hesap' },
          { label: 'Adreslerim' },
        ]}
      />
      <AdreslerClient />
    </div>
  )
}
