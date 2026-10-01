import { Suspense } from 'react'
import type { Metadata } from 'next'
import BasariliClient from './BasariliClient'

export const metadata: Metadata = {
  title: 'Siparişiniz Alındı — Zuulab',
  description: 'Zuulab siparişiniz başarıyla alındı ve üretim sırasına eklendi.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function OrderSuccessPage() {
  return (
    <div className="container" style={{ paddingTop: 'var(--sp-12, 48px)', paddingBottom: 'var(--sp-20, 80px)' }}>
      <Suspense fallback={<div style={{ textAlign: 'center', padding: 40 }}>Yükleniyor...</div>}>
        <BasariliClient />
      </Suspense>
    </div>
  )
}
