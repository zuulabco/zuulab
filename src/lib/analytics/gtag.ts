/**
 * Google Analytics 4, browser side. Every call is a no-op until the GA tag has
 * loaded, and the tag loads only after the visitor accepts analytics cookies
 * (see components/analytics/GoogleAnalytics.tsx), so callers never need to check
 * consent themselves.
 *
 * Event and parameter names follow GA4's recommended e-commerce events, so the
 * built-in reports (and the admin's Analizler page) understand them.
 */

import { getConsent } from '@/lib/consent'

export const GA_MEASUREMENT_ID = (process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '').trim()

type GtagParams = Record<string, unknown>

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

/**
 * Sets up the gtag queue and the GA config. Idempotent. Events sent before
 * gtag.js has downloaded wait in dataLayer and go out, in order, once it loads.
 */
export function initGtag(): void {
  if (typeof window === 'undefined' || !GA_MEASUREMENT_ID || typeof window.gtag === 'function') return
  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag() {
    // gtag.js reads the arguments object itself, not an array
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments)
  }
  window.gtag('consent', 'default', {
    analytics_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  })
  window.gtag('js', new Date())
  window.gtag('config', GA_MEASUREMENT_ID, { anonymize_ip: true })
}

export function track(event: string, params: GtagParams = {}): void {
  // Nothing is sent without analytics consent (checked every time: it can be withdrawn)
  if (typeof window === 'undefined' || !GA_MEASUREMENT_ID || getConsent() !== 'all') return
  // Page effects can run before the GoogleAnalytics component's, so set up the queue here too
  initGtag()
  if (typeof window.gtag !== 'function') return
  try {
    window.gtag('event', event, params)
  } catch {
    // analytics must never break the shop
  }
}

/** A product as a GA4 `items[]` entry */
export interface AnalyticsItem {
  id: string
  name: string
  price: number
  quantity?: number
  category?: string
  variant?: string | null
  sku?: string
}

export function toGaItem(item: AnalyticsItem, index?: number) {
  return {
    item_id: item.sku || item.id,
    item_name: item.name,
    price: item.price,
    quantity: item.quantity ?? 1,
    item_brand: 'zuulab',
    ...(item.category ? { item_category: item.category } : {}),
    ...(item.variant ? { item_variant: item.variant } : {}),
    ...(index !== undefined ? { index } : {}),
  }
}

/** Shorthand for the e-commerce events: value is the sum of the items */
export function trackItems(event: string, items: AnalyticsItem[], extra: GtagParams = {}): void {
  if (items.length === 0) return
  const value = Math.round(items.reduce((s, i) => s + i.price * (i.quantity ?? 1), 0) * 100) / 100
  track(event, { currency: 'TRY', value, items: items.map((i, n) => toGaItem(i, n)), ...extra })
}
