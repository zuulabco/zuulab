import type { Metadata } from 'next'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import ProfilClient from './ProfilClient'

export const metadata: Metadata = {
  title: 'Profilim — Zuulab',
  description: 'Zuulab hesap profilinizi ve iletişim bilgilerinizi yönetin.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function ProfilPage() {
  return (
    <div className="container" style={{ paddingTop: 'var(--sp-8, 32px)', paddingBottom: 'var(--sp-20, 80px)' }}>
      <Breadcrumbs
        items={[
          { label: 'Hesabım', href: '/hesap' },
          { label: 'Profilim' },
        ]}
      />
      <ProfilClient />
    </div>
  )
}
