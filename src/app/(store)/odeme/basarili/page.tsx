import { ContentPageSkeleton } from '@/components/common/PageSkeletons'
import { Suspense } from 'react'
import type { Metadata } from 'next'
import BasariliClient from './BasariliClient'

export const metadata: Metadata = {
  title: 'Siparişiniz Alındı',
  description: 'Zuulab siparişiniz başarıyla alındı ve üretim sırasına eklendi.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function OrderSuccessPage() {
  return (
    <div className="container" style={{ paddingTop: 'var(--sp-12, 48px)', paddingBottom: 'var(--sp-20, 80px)' }}>
      <Suspense fallback={<ContentPageSkeleton />}>
        <BasariliClient />
      </Suspense>
    </div>
  )
}
