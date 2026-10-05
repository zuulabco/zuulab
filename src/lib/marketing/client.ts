'use client'

import { getConsent } from '@/lib/consent'
import { getAttribution, getFirstTouchAttribution } from './attribution'
import { createDispatcher } from './dispatcher'
import { ga4BrowserDestination } from './destinations/ga4-browser'
import { metaCapiRelayDestination, metaPixelDestination } from './destinations/meta-pixel'
import {
  buildEvent,
  DEFAULT_CURRENCY,
  newEventId,
  type CanonicalEventName,
  type EventConsent,
  type MarketingEvent,
  type MarketingEventData,
} from './events'

/**
 * Browser entry point for canonical events: `trackEvent('add_to_cart', { ... })`.
 *
 * It fills in who and where (anonymous id, session id, user id, page, referrer, campaign)
 * and hands the event to the dispatcher. It never throws and never waits, so calling it
 * from a click handler or a store action cannot slow down or break the shop.
 *
 * Destinations: GA4, Meta Pixel and the relay that hands browser events to the server for
 * Meta CAPI. Another one is added by registering it here; callers do not change.
 */
export const browserDispatcher = createDispatcher({
  destinations: [ga4BrowserDestination, metaPixelDestination, metaCapiRelayDestination],
})

const ANON_KEY = 'zuulab_aid'
const SESSION_KEY = 'zuulab_sid'

let currentUserId: string | undefined

/** Set by MarketingTracker from the auth store; undefined when signed out */
export function setMarketingUser(userId: string | undefined): void {
  currentUserId = userId
}

function stored(storage: 'local' | 'session', key: string): string | undefined {
  try {
    const s = storage === 'local' ? localStorage : sessionStorage
    let v = s.getItem(key)
    if (!v) {
      v = newEventId()
      s.setItem(key, v)
    }
    return v
  } catch {
    return undefined
  }
}

/**
 * Identity ids are persisted only with consent: a stored visitor id is itself a
 * tracking identifier under KVKK, so without "all" none is created or read.
 */
function identity(consent: EventConsent): Pick<MarketingEvent, 'anonymousId' | 'sessionId'> {
  if (consent !== 'all') return {}
  return { anonymousId: stored('local', ANON_KEY), sessionId: stored('session', SESSION_KEY) }
}

/** The browser-side context every event shares; exported for tests and for fetching server events */
export function browserContext(consent: EventConsent = getConsent()) {
  return {
    source: 'browser' as const,
    consent,
    base: {
      ...identity(consent),
      ...(consent === 'all' ? getAttribution() : {}),
      userId: currentUserId,
      pageUrl: typeof location !== 'undefined' ? location.href : undefined,
      referrer: typeof document !== 'undefined' && document.referrer ? document.referrer : undefined,
      currency: DEFAULT_CURRENCY,
    } satisfies Partial<MarketingEvent>,
  }
}

export function trackEvent(name: CanonicalEventName, data: MarketingEventData = {}): void {
  try {
    const event = buildEvent(name, data, browserContext())
    void browserDispatcher.dispatch(event)
  } catch {
    // tracking must never break the shop
  }
}

/**
 * What checkout reports to the server so the order carries it: the cookie-banner choice,
 * and (only with consent) the visitor id and campaign parameters. A server-side event
 * for the order (Meta CAPI later) then needs no browser.
 */
export function getCheckoutMarketingContext() {
  const consent = getConsent()
  if (consent !== 'all') return { consent }
  return {
    consent,
    anonymousId: identity(consent).anonymousId,
    attribution: { last: getAttribution(), first: getFirstTouchAttribution() },
  }
}

/** Sends an event built elsewhere (the server's purchase) through the browser destinations */
export function dispatchBrowserEvent(event: Omit<MarketingEvent, 'source' | 'consent'>): void {
  try {
    const ctx = browserContext()
    void browserDispatcher.dispatch({ ...ctx.base, ...event, source: 'browser', consent: ctx.consent } as MarketingEvent)
  } catch {
    // tracking must never break the shop
  }
}
