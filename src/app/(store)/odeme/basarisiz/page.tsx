import { ContentPageSkeleton } from '@/components/common/PageSkeletons'
import { Suspense } from 'react'
import type { Metadata } from 'next'
import BasarisizClient from './BasarisizClient'

export const metadata: Metadata = {
  title: 'Ödeme Başarısız',
  description: 'Ödeme işlemi tamamlanamadı. Lütfen bilgilerinizi kontrol ederek tekrar deneyiniz.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function OrderFailurePage() {
  return (
    <div className="container" style={{ paddingTop: 'var(--sp-12, 48px)', paddingBottom: 'var(--sp-20, 80px)' }}>
      <Suspense fallback={<ContentPageSkeleton />}>
        <BasarisizClient />
      </Suspense>
    </div>
  )
}
