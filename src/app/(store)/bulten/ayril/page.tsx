import type { Metadata } from 'next'
import UnsubscribeClient from './UnsubscribeClient'

export const metadata: Metadata = {
  title: 'Bültenden ayrıl',
  robots: { index: false, follow: false },
}

/**
 * Opening the link does nothing by itself (mail scanners open links); the button
 * does. Mail apps' own one-click unsubscribe posts to /api/newsletter/unsubscribe.
 */
export default async function NewsletterUnsubscribePage({ searchParams }: { searchParams: Promise<{ t?: string; m?: string }> }) {
  const { t, m } = await searchParams
  return <UnsubscribeClient token={String(t ?? '')} message={String(m ?? '')} />
}
