'use client'

import { useEffect } from 'react'
import { CONSENT_EVENT, getConsent, type ConsentLevel } from '@/lib/consent'
import { trackEvent } from '@/lib/marketing/client'
import { initMetaPixel, revokeMetaPixel } from '@/lib/marketing/destinations/meta-pixel'

/**
 * Loads the Meta Pixel, only when a pixel id is configured AND the visitor chose "tümünü
 * kabul et" in the cookie banner (KVKK). Nothing is loaded or sent before that.
 *
 * It renders nothing and sends nothing by itself: every Pixel event comes from the
 * canonical event layer (lib/marketing), through the meta-pixel destination. It must sit
 * before MarketingTracker so the pixel exists when the first page_view fires.
 */
export default function MetaPixel({ pixelId }: { pixelId: string }) {
  useEffect(() => {
    if (!pixelId) return
    if (getConsent() === 'all') initMetaPixel(pixelId)

    const onChange = (e: Event) => {
      const level = (e as CustomEvent<ConsentLevel>).detail
      if (level === 'all') {
        initMetaPixel(pixelId)
        // The visitor accepted on this page: it is a page view the pixel has not seen yet
        trackEvent('page_view', {})
      } else {
        revokeMetaPixel()
      }
    }
    window.addEventListener(CONSENT_EVENT, onChange)
    return () => window.removeEventListener(CONSENT_EVENT, onChange)
  }, [pixelId])

  return null
}
