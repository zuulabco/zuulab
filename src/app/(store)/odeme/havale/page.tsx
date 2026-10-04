import { ContentPageSkeleton } from '@/components/common/PageSkeletons'
import { Suspense } from 'react'
import type { Metadata } from 'next'
import HavaleClient from './HavaleClient'

export const metadata: Metadata = {
  title: 'Havale / EFT Bilgileri',
  description: 'zuulab siparişiniz için havale / EFT ödeme bilgileri.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function BankTransferPage() {
  return (
    <div className="container" style={{ paddingTop: 'var(--sp-12, 48px)', paddingBottom: 'var(--sp-20, 80px)' }}>
      <Suspense fallback={<ContentPageSkeleton />}>
        <HavaleClient />
      </Suspense>
    </div>
  )
}
