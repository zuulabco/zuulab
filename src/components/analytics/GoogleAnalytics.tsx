'use client'

import { useEffect, useState } from 'react'
import Script from 'next/script'
import { CONSENT_EVENT, getConsent, type ConsentLevel } from '@/lib/consent'
import { GA_MEASUREMENT_ID, initGtag, track } from '@/lib/analytics/gtag'

/**
 * Google Analytics 4 for the storefront.
 *
 * Loads only when a measurement ID is configured AND the visitor chose "tümüne
 * izin ver" in the cookie banner (KVKK): nothing is sent before that. Page views,
 * including client-side navigation, come from GA4's enhanced measurement.
 *
 * Every click on a link or button is also sent as `ui_click` with the link text,
 * target URL and the page area it sits in, so the admin can see what people click.
 */
export default function GoogleAnalytics() {
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    if (!GA_MEASUREMENT_ID) return
    const apply = (level: ConsentLevel | null) => {
      if (level === 'all') {
        initGtag()
        window.gtag?.('consent', 'update', { analytics_storage: 'granted' })
      }
      setAllowed(level === 'all')
      // A visitor who withdraws consent stops being measured at once
      if (level !== 'all' && typeof window.gtag === 'function') {
        window.gtag('consent', 'update', { analytics_storage: 'denied', ad_storage: 'denied' })
      }
    }
    apply(getConsent())
    const onChange = (e: Event) => apply((e as CustomEvent<ConsentLevel>).detail)
    window.addEventListener(CONSENT_EVENT, onChange)
    return () => window.removeEventListener(CONSENT_EVENT, onChange)
  }, [])

  useEffect(() => {
    if (!allowed) return
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.('a, button')
      if (!el) return
      const text = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80)
      const href = el instanceof HTMLAnchorElement ? el.getAttribute('href') || '' : ''
      if (/wa\.me\/|whatsapp\.com/.test(href)) track('whatsapp_click', { page_path: location.pathname })
      track('ui_click', {
        link_text: text || '(simge)',
        link_url: href,
        click_area: clickArea(el),
        element: el.tagName.toLowerCase(),
      })
    }
    document.addEventListener('click', onClick, { capture: true, passive: true })
    return () => document.removeEventListener('click', onClick, { capture: true })
  }, [allowed])

  if (!GA_MEASUREMENT_ID || !allowed) return null

  return <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
}

/** Where on the page a click happened, in words the admin understands */
function clickArea(el: Element): string {
  const marked = el.closest('[data-track-area]')
  if (marked) return marked.getAttribute('data-track-area') || 'diğer'
  if (el.closest('header')) return 'üst menü'
  if (el.closest('#mobile-menu')) return 'mobil menü'
  if (el.closest('footer')) return 'alt bilgi'
  if (el.closest('[aria-roledescription="carousel"]')) return 'ana sayfa slayt'
  const section = el.closest('section[aria-label], section[id]')
  if (section) return section.getAttribute('aria-label') || section.id
  return 'sayfa içeriği'
}
