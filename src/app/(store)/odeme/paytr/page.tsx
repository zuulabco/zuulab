import type { Metadata } from 'next'
import { Suspense } from 'react'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import PayTRClient from './PayTRClient'

export const metadata: Metadata = {
  title: 'PayTR ile Ödeme',
  description: 'Zuulab PayTR 3D Secure 256-bit SSL korumalı ödeme ekranı.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function PayTRPage() {
  return (
    <div className="container" style={{ paddingTop: 'var(--sp-6, 24px)', paddingBottom: 'var(--sp-20, 80px)' }}>
      <Breadcrumbs
        items={[
          { label: 'sepetim', href: '/sepet' },
          { label: 'ödeme', href: '/odeme' },
          { label: 'paytr güvenli ödeme' },
        ]}
      />
      <Suspense fallback={
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted, #a1a1aa)' }}>
          Ödeme ekranı hazırlanıyor...
        </div>
      }>
        <PayTRClient />
      </Suspense>
    </div>
  )
}
