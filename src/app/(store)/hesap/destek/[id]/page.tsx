import type { Metadata } from 'next'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import DestekDetayClient from './DestekDetayClient'

interface PageProps {
  params: Promise<{ id: string }>
}

export const metadata: Metadata = {
  title: 'Destek Talebi',
  description: 'Destek talebiniz ve mesajlaşma geçmişi.',
  robots: {
    index: false,
    follow: false,
  },
}

export default async function DestekDetayPage({ params }: PageProps) {
  const { id } = await params

  return (
    <div className="container" style={{ paddingTop: 'var(--sp-8)', paddingBottom: 'var(--sp-20)' }}>
      <Breadcrumbs
        items={[
          { label: 'Hesabım', href: '/hesap' },
          { label: 'Destek Taleplerim', href: '/hesap/destek' },
          { label: 'Talep Detayı' },
        ]}
      />
      <DestekDetayClient ticketId={id} />
    </div>
  )
}
