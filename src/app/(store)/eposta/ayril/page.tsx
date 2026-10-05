import type { Metadata } from 'next'
import OptoutClient from './OptoutClient'

export const metadata: Metadata = {
  title: 'E-posta tercihi',
  robots: { index: false, follow: false },
}

/**
 * Opening the link does nothing by itself (mail scanners open links); the button does. Mail apps'
 * own one-click unsubscribe posts to /api/email/optout.
 */
export default async function EmailOptoutPage({ searchParams }: { searchParams: Promise<{ e?: string; s?: string }> }) {
  const { e, s } = await searchParams
  return <OptoutClient e={String(e ?? '')} s={String(s ?? '')} />
}
