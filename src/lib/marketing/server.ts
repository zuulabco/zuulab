import 'server-only'
import { createDispatcher, type Destination, type Dispatcher } from './dispatcher'
import { buildEvent, type MarketingEvent, type MarketingEventData, type CanonicalEventName } from './events'
import { buildPurchaseEvent } from './purchase'
import { findOrderByNumber } from '@/lib/services/orders.service'

/**
 * Server entry point for canonical events. Server-side destinations (Meta CAPI, GA4
 * Measurement Protocol, internal analytics, Resend automations) are registered on
 * `serverDispatcher` in later phases; this phase ships none that call an outside API.
 *
 * Every call here is best effort: it never throws and is time-bounded, so a slow or
 * failing destination cannot hold up or break an order, a payment or a webhook reply.
 *
 * Consent: a server-side event has no browser to ask. The purchase carries the visitor's
 * cookie-banner choice that checkout stored on the order (`orders.marketing_consent`); an
 * event with unknown consent (null) is skipped by every destination that needs consent.
 */

/** Opt-in console logger for checking the pipeline: set MARKETING_EVENT_DEBUG=1 */
const debugDestination: Destination = {
  id: 'debug-log',
  consent: 'none',
  accepts: () => process.env.MARKETING_EVENT_DEBUG === '1',
  send(event) {
    console.info(`[marketing] ${event.eventName} ${event.eventId}`, JSON.stringify(event))
  },
}

export const serverDispatcher: Dispatcher = createDispatcher({ destinations: [debugDestination] })

export function buildServerEvent(name: CanonicalEventName, data: MarketingEventData): MarketingEvent {
  return buildEvent(name, data, { source: 'server' })
}

export async function trackServerEvent(name: CanonicalEventName, data: MarketingEventData): Promise<void> {
  try {
    await serverDispatcher.dispatch(buildServerEvent(name, data))
  } catch {
    // tracking must never break the shop
  }
}

/**
 * The server copy of a purchase, sent from the two places where a sale becomes final:
 * a confirmed card / havale payment, and a confirmed kapıda ödeme order. Both are
 * guarded by the payment service's compare-and-set, so each runs once per order; the
 * deterministic eventId (purchase_<orderNumber>) and the dispatcher's repeat filter are
 * extra protection, and Meta deduplicates on the same id.
 *
 * Returns without doing anything unless the stored order really is a sale.
 */
export async function emitPurchaseForOrder(orderNumber: string): Promise<void> {
  try {
    const order = await findOrderByNumber(orderNumber)
    if (!order) return
    const purchase = buildPurchaseEvent(order)
    if (!purchase) return
    // Consent is the visitor's choice recorded with the order (null for older orders = not granted)
    await serverDispatcher.dispatch({ ...purchase, source: 'server', consent: order.marketingConsent })
  } catch (error) {
    console.warn(`[marketing] purchase event for ${orderNumber} failed:`, error instanceof Error ? error.message : error)
  }
}
