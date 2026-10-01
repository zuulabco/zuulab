import type { Metadata, Viewport } from 'next'
import { DM_Sans, DM_Serif_Display } from 'next/font/google'
import React from 'react'
import ToastContainer from '@/components/common/ToastContainer'
import './globals.css'

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  weight: ['300', '400', '500', '600', '700'],
})

const dmSerif = DM_Serif_Display({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['400'],
  style: ['normal', 'italic'],
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
}

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? 'https://zuulab.com'
  ),
  title: {
    default: 'zuulab — 3d baskı ürünleri',
    template: '%s | zuulab',
  },
  description:
    'zuulab, yüksek kaliteli 3D baskı ürünleri sunan premium bir Türk markasıdır. Benzersiz tasarımlar, dayanıklı malzemeler ve hızlı üretim.',
  keywords: ['3D baskı', '3D print', 'Zuulab', 'Türkiye', 'premium', 'özel üretim'],
  openGraph: {
    type: 'website',
    locale: 'tr_TR',
    siteName: 'zuulab',
    title: 'zuulab — 3d baskı ürünleri',
    description:
      'Yüksek kaliteli 3D baskı ürünleri. Premium malzemeler, özel tasarımlar.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'zuulab — 3d baskı ürünleri',
    description: 'Yüksek kaliteli 3D baskı ürünleri.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="tr"
      className={`${dmSans.variable} ${dmSerif.variable}`}
    >
      <body>
        {children}
        <ToastContainer />
      </body>
    </html>
  )
}
