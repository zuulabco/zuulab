import type { Metadata, Viewport } from 'next'
import { SITE_URL } from '@/lib/config/urls'
import { DEFAULT_OG_IMAGE } from '@/lib/seo/metadata'
import { DM_Sans, DM_Serif_Display } from 'next/font/google'
import React from 'react'
import ToastContainer from '@/components/common/ToastContainer'
import ImageFadeScript from '@/components/common/ImageFadeScript'
import './globals.css'

const dmSans = DM_Sans({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-sans',
  display: 'swap',
  weight: ['300', '400', '500', '600', '700'],
})

const dmSerif = DM_Serif_Display({
  subsets: ['latin', 'latin-ext'],
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
  metadataBase: new URL(SITE_URL),
  applicationName: 'zuulab',
  title: {
    default: 'zuulab · 3D baskı tasarım objeleri, lambalar ve oyuncaklar',
    // Every page gives only its own name: "Ürünler · zuulab"
    template: '%s · zuulab',
  },
  description:
    'Bolu’da tasarlanıp üretilen 3D baskı lambalar, ev ve masaüstü objeleri, çocuk oyuncakları ve kişiye özel hediyeler.',
  // No canonical here: it would be inherited, pointing every page at the home page.
  // Public pages set their own through pageMetadata() (src/lib/seo/metadata.ts).
  openGraph: {
    type: 'website',
    locale: 'tr_TR',
    siteName: 'zuulab',
    title: 'zuulab · 3D baskı tasarım objeleri, lambalar ve oyuncaklar',
    description:
      'Bolu’da tasarlanıp üretilen 3D baskı lambalar, ev ve masaüstü objeleri, çocuk oyuncakları ve kişiye özel hediyeler.',
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    images: [DEFAULT_OG_IMAGE.url],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
  },
  formatDetection: { telephone: false, email: false, address: false },
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
      // ImageFadeScript adds .img-fade before hydration.
      suppressHydrationWarning
    >
      <head>
        <ImageFadeScript />
      </head>
      <body>
        {children}
        <ToastContainer />
      </body>
    </html>
  )
}
