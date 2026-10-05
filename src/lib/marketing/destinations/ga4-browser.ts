import { track, toGaItem, type AnalyticsItem } from '@/lib/analytics/gtag'
import type { Destination } from '../dispatcher'
import type { MarketingEvent, MarketingItem } from '../events'
import { itemsOf, sumItems } from '../events'
import { ga4EventName } from '../mapping'

/**
 * Google Analytics 4 in the browser. It sends through the existing gtag layer
 * (lib/analytics/gtag.ts), so the tag loading, the consent check and the parameter
 * shape the admin's Analizler page reads stay exactly as they were; this adapter only
 * translates a canonical event into that vocabulary.
 */

function asAnalyticsItem(i: MarketingItem): AnalyticsItem {
  return {
    id: i.productId,
    sku: i.sku,
    name: i.productName,
    price: i.price,
    quantity: i.quantity,
    category: i.category,
    variant: i.variantLabel,
  }
}

export { itemsOf }

/** GA4 parameters for an event, or null when GA4 has nothing to say about it */
export function toGa4Params(event: MarketingEvent): Record<string, unknown> | null {
  switch (event.eventName) {
    case 'product_view':
    case 'add_to_cart':
    case 'remove_from_cart':
    case 'begin_checkout':
    case 'add_payment_info':
    case 'purchase': {
      const items = itemsOf(event)
      if (items.length === 0) return null
      const params: Record<string, unknown> = {
        currency: event.currency ?? 'TRY',
        items: items.map((i, n) => toGaItem(asAnalyticsItem(i), n)),
      }
      if (event.eventName === 'purchase') {
        // GA4 revenue excludes shipping, which it takes as its own field; `value` of a
        // canonical purchase is what the customer paid
        params.value = Math.round(((event.value ?? sumItems(items)) - (event.shipping ?? 0)) * 100) / 100
        params.transaction_id = event.orderId
        if (event.shipping) params.shipping = event.shipping
      } else {
        params.value = event.value ?? sumItems(items)
      }
      if (event.coupon) params.coupon = event.coupon
      if (event.eventName === 'add_payment_info' && event.paymentMethod) params.payment_type = event.paymentMethod
      return params
    }
    case 'search':
      return { search_term: event.searchTerm }
    case 'signup':
    case 'login':
    case 'newsletter_signup':
      return event.method ? { method: event.method } : {}
    default:
      return null
  }
}

export const ga4BrowserDestination: Destination = {
  id: 'ga4-browser',
  consent: 'analytics',
  accepts(event) {
    // GA4's enhanced measurement already counts page views, including client-side navigation
    if (event.eventName === 'page_view') return false
    return ga4EventName(event.eventName) !== null && toGa4Params(event) !== null
  },
  send(event) {
    const name = ga4EventName(event.eventName)
    const params = toGa4Params(event)
    if (name && params) track(name, params)
  },
}
