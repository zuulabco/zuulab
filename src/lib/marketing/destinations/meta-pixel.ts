import type { Destination } from '../dispatcher'
import { metaBrowserEventName } from '../mapping'
import { CAPI_RELAY_EVENTS, toMetaCustomData } from './meta-shared'

/**
 * Meta Pixel in the browser. The pixel script is loaded by components/analytics/MetaPixel
 * only after the visitor accepted the cookie banner; until then `window.fbq` does not
 * exist, this destination accepts nothing, and nothing leaves the browser.
 *
 * Every event goes out with `eventID` = the canonical eventId, which is how Meta joins it
 * with the Conversions API copy (purchase: `purchase_<orderNumber>` on both sides).
 */

type Fbq = (...args: unknown[]) => void

declare global {
  interface Window {
    fbq?: Fbq & { queue?: unknown[]; loaded?: boolean; version?: string; disablePushState?: boolean; push?: unknown }
    _fbq?: unknown
  }
}

let initialized = false

/** Loads fbevents.js and initialises the pixel. Idempotent; call only with consent. */
export function initMetaPixel(pixelId: string): void {
  if (initialized || typeof window === 'undefined' || !pixelId) return
  initialized = true

  if (!window.fbq) {
    // The standard Meta stub: calls made before the script arrives are queued and replayed
    const fbq = function (...args: unknown[]) {
      if ((fbq as unknown as { callMethod?: (...a: unknown[]) => void }).callMethod) {
        ;(fbq as unknown as { callMethod: (...a: unknown[]) => void }).callMethod(...args)
      } else {
        fbq.queue.push(args)
      }
    } as unknown as NonNullable<Window['fbq']> & { queue: unknown[] }
    fbq.push = fbq
    fbq.loaded = true
    fbq.version = '2.0'
    fbq.queue = []
    // We send PageView ourselves (MarketingTracker); the pixel must not add its own on
    // every history change
    fbq.disablePushState = true
    window.fbq = fbq
    if (!window._fbq) window._fbq = fbq

    const script = document.createElement('script')
    script.async = true
    script.src = 'https://connect.facebook.net/en_US/fbevents.js'
    document.head.appendChild(script)
  }

  // No automatic button-click / form-field detection: only the events we send ourselves
  window.fbq('set', 'autoConfig', false, pixelId)
  window.fbq('init', pixelId)
}

/** The visitor withdrew consent: tell the pixel; the dispatcher already stops sending */
export function revokeMetaPixel(): void {
  try {
    window.fbq?.('consent', 'revoke')
  } catch {
    // nothing to do
  }
}

export const metaPixelDestination: Destination = {
  id: 'meta-pixel',
  consent: 'marketing',
  accepts(event) {
    if (typeof window === 'undefined' || typeof window.fbq !== 'function') return false
    return metaBrowserEventName(event.eventName) !== null && toMetaCustomData(event) !== null
  },
  send(event) {
    const name = metaBrowserEventName(event.eventName)
    const data = toMetaCustomData(event)
    if (!name || !data || typeof window.fbq !== 'function') return
    window.fbq('track', name, data, { eventID: event.eventId })
  },
}

/**
 * Hands the browser events that Meta's Conversions API should also get to our own
 * endpoint, which adds what only the server can (IP, cookies, hashed identity) and sends
 * them with the same eventId. It only runs when the pixel is active, i.e. Meta is
 * configured and the visitor consented.
 */
export const metaCapiRelayDestination: Destination = {
  id: 'meta-capi-relay',
  consent: 'marketing',
  accepts(event) {
    if (typeof window === 'undefined' || typeof window.fbq !== 'function') return false
    return event.source === 'browser' && CAPI_RELAY_EVENTS.has(event.eventName)
  },
  async send(event) {
    await fetch('/api/marketing/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      keepalive: true,
    })
  },
}
