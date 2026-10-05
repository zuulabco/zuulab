import { missingFields, type EventConsent, type MarketingEvent } from './events'

/**
 * What a destination needs the visitor to have agreed to (KVKK):
 * - "none": strictly necessary / first-party operational use
 * - "analytics": measuring how the shop is used (GA4, internal analytics)
 * - "marketing": advertising and remarketing (Meta Pixel / CAPI, ad audiences)
 * Today the cookie banner has one opt-in level ("all") that covers both analytics and
 * marketing; the split lives here so a finer banner can be added without touching callers.
 */
export type ConsentPurpose = 'none' | 'analytics' | 'marketing'

export function consentAllows(purpose: ConsentPurpose, consent: EventConsent | undefined): boolean {
  if (purpose === 'none') return true
  return consent === 'all'
}

/** A place canonical events go: GA4, Meta Pixel, Meta CAPI, internal analytics, Resend… */
export interface Destination {
  id: string
  consent: ConsentPurpose
  /** false = this destination ignores the event (no mapping, or handled elsewhere) */
  accepts(event: MarketingEvent): boolean
  send(event: MarketingEvent): void | Promise<void>
}

export interface DispatcherOptions {
  destinations: Destination[]
  /** A destination that has not answered after this long is abandoned (never awaited past it) */
  timeoutMs?: number
  /** Called for every destination failure; must not throw. Default: console.warn */
  onError?: (destinationId: string, error: unknown, event: MarketingEvent) => void
  /** Remember this many recent eventIds and drop repeats (best effort, per process) */
  dedupeWindow?: number
}

export interface Dispatcher {
  /** Never throws and never rejects. Resolves when every destination has finished or timed out. */
  dispatch(event: MarketingEvent): Promise<void>
  /** Adds a destination (idempotent by id) */
  register(destination: Destination): void
  unregister(id: string): void
}

const DEFAULT_TIMEOUT_MS = 3000

/**
 * Tracking is best effort: whatever a destination does (throws, rejects, hangs, is
 * slow), `dispatch` returns normally, so checkout, payment and sign-in are never
 * affected. Consent is checked per destination, at the one place every event passes.
 */
export function createDispatcher(options: DispatcherOptions): Dispatcher {
  const destinations = [...options.destinations]
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const onError =
    options.onError ??
    ((id, error) => console.warn(`[marketing] destination "${id}" failed:`, error instanceof Error ? error.message : error))
  const seen = new Set<string>()
  const dedupeSize = options.dedupeWindow ?? 500

  const remember = (eventId: string): boolean => {
    if (seen.has(eventId)) return false
    seen.add(eventId)
    if (seen.size > dedupeSize) seen.delete(seen.values().next().value as string)
    return true
  }

  const deliver = async (destination: Destination, event: MarketingEvent): Promise<void> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const result = destination.send(event)
      if (result && typeof (result as Promise<void>).then === 'function') {
        await Promise.race([
          result,
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, timeoutMs)
          }),
        ])
      }
    } catch (error) {
      try {
        onError(destination.id, error, event)
      } catch {
        // an error handler must not break the shop either
      }
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  return {
    async dispatch(event) {
      try {
        const missing = missingFields(event)
        if (missing.length > 0) {
          console.warn(`[marketing] dropped ${event.eventName}: missing ${missing.join(', ')}`)
          return
        }
        const targets = destinations.filter((d) => {
          try {
            return consentAllows(d.consent, event.consent) && d.accepts(event)
          } catch {
            return false
          }
        })
        if (targets.length === 0) return
        if (!remember(`${event.eventId}`)) return
        await Promise.all(targets.map((d) => deliver(d, event)))
      } catch (error) {
        console.warn('[marketing] dispatch failed:', error instanceof Error ? error.message : error)
      }
    },
    register(destination) {
      if (!destinations.some((d) => d.id === destination.id)) destinations.push(destination)
    },
    unregister(id) {
      const i = destinations.findIndex((d) => d.id === id)
      if (i >= 0) destinations.splice(i, 1)
    },
  }
}
