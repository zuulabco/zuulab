import 'server-only'
import { createDispatcher, type Destination, type Dispatcher } from './dispatcher'
import { buildEvent, type EventUser, type MarketingEvent, type MarketingEventData, type CanonicalEventName } from './events'
import { buildPurchaseEvent } from './purchase'
import { metaCapiDestination } from './destinations/meta-capi'
import { findOrderByNumber, type StoredOrder } from '@/lib/services/orders.service'

/**
 * Server entry point for canonical events. Server-side destinations are registered on
 * `serverDispatcher`: Meta CAPI today; GA4 Measurement Protocol, internal analytics and
 * Resend automations in later phases.
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
    // the person's data (user, client) is never logged
    const loggable: Partial<MarketingEvent> = { ...event }
    delete loggable.user
    delete loggable.client
    console.info(`[marketing] ${event.eventName} ${event.eventId}`, JSON.stringify(loggable))
  },
}

export const serverDispatcher: Dispatcher = createDispatcher({ destinations: [debugDestination, metaCapiDestination] })

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
    await serverDispatcher.dispatch({
      ...purchase,
      source: 'server',
      consent: order.marketingConsent,
      user: userOfOrder(order),
      ...(order.attribution?.meta ? { client: order.attribution.meta } : {}),
    })
  } catch (error) {
    console.warn(`[marketing] purchase event for ${orderNumber} failed:`, error instanceof Error ? error.message : error)
  }
}

/** The buyer's contact data from the order's own snapshot; Meta CAPI hashes it before sending */
function userOfOrder(order: StoredOrder): EventUser {
  const address = order.shippingAddressSnapshot
  const [firstName, ...rest] = (address.fullName || '').trim().split(/\s+/)
  return {
    email: order.customerEmail || address.email,
    phone: address.phone,
    firstName,
    lastName: rest.join(' ') || undefined,
    city: address.city,
    postalCode: address.postalCode,
    country: 'tr',
  }
}
