import { itemsOf, sumItems, type CanonicalEventName, type MarketingEvent } from '../events'

/**
 * What the Meta Pixel (browser) and the Conversions API (server) both need to agree on:
 * the parameters of an event. The names come from mapping.ts. Meta matches the two
 * copies of an event by `event_name` + `event_id`, so the same parameters on both sides
 * keep the numbers consistent.
 *
 * No browser or server imports: this file runs on both sides.
 */

/**
 * Browser events that are also relayed to the server for the Conversions API. page_view
 * and search stay browser-only (volume, little value for ad matching); purchase is not
 * relayed because the server sends its own copy from the stored order.
 */
export const CAPI_RELAY_EVENTS: ReadonlySet<CanonicalEventName> = new Set([
  'product_view',
  'add_to_cart',
  'begin_checkout',
  'add_payment_info',
  'signup',
])

/** Meta `custom_data` / Pixel parameters of an event, or null when it lacks what Meta needs */
export function toMetaCustomData(event: MarketingEvent): Record<string, unknown> | null {
  switch (event.eventName) {
    case 'page_view':
      return {}
    case 'search':
      return event.searchTerm ? { search_string: event.searchTerm } : null
    case 'signup':
      return event.method ? { content_name: event.method } : {}
    case 'product_view':
    case 'add_to_cart':
    case 'begin_checkout':
    case 'add_payment_info':
    case 'purchase': {
      const items = itemsOf(event)
      if (items.length === 0) return null
      const data: Record<string, unknown> = {
        content_type: 'product',
        content_ids: items.map((i) => i.productId),
        contents: items.map((i) => ({ id: i.productId, quantity: i.quantity, item_price: i.price })),
        currency: event.currency ?? 'TRY',
        value: event.value ?? sumItems(items),
      }
      if (items.length === 1) data.content_name = items[0].productName
      if (event.eventName !== 'product_view') data.num_items = items.reduce((n, i) => n + i.quantity, 0)
      if (event.eventName === 'purchase' && event.orderId) data.order_id = event.orderId
      return data
    }
    default:
      return null
  }
}
