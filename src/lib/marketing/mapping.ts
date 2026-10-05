import type { CanonicalEventName } from './events'

/**
 * How each canonical event is named by the tools that will receive it. This table is
 * the single place that knows GA4 and Meta vocabulary; the event model itself does not.
 * `null` = the destination has no matching event, so nothing is sent there.
 *
 * | ZUULAB            | GA4              | Meta browser (Pixel) | Meta server (CAPI)   |
 * | ----------------- | ---------------- | -------------------- | -------------------- |
 * | page_view         | page_view        | PageView             | PageView             |
 * | product_view      | view_item        | ViewContent          | ViewContent          |
 * | search            | search           | Search               | Search               |
 * | add_to_cart       | add_to_cart      | AddToCart            | AddToCart            |
 * | remove_from_cart  | remove_from_cart | (none)               | (none)               |
 * | begin_checkout    | begin_checkout   | InitiateCheckout     | InitiateCheckout     |
 * | add_payment_info  | add_payment_info | AddPaymentInfo       | AddPaymentInfo       |
 * | purchase          | purchase         | Purchase             | Purchase             |
 * | signup            | sign_up          | CompleteRegistration | CompleteRegistration |
 * | login             | login            | (none)               | (none)               |
 * | newsletter_signup | sign_up          | (open, see below)    | (open, see below)    |
 *
 * Notes:
 * - Meta has no standard event for removing from the cart or logging in.
 * - newsletter_signup keeps GA4's `sign_up` (method "bülten"): the admin's Analizler
 *   page already reads it as "Bülten kaydı". Whether Meta gets `Lead` or `Subscribe`
 *   for it is a decision for the Meta phase; until then it is not sent there.
 * - GA4's enhanced measurement already reports page views (including client-side
 *   navigation), so the browser GA4 adapter skips page_view to avoid counting twice.
 *   The mapping stays here for server-side GA4 (Measurement Protocol) later.
 */
export interface DestinationNames {
  ga4: string | null
  metaBrowser: string | null
  metaCapi: string | null
}

export const EVENT_MAPPING: Record<CanonicalEventName, DestinationNames> = {
  page_view: { ga4: 'page_view', metaBrowser: 'PageView', metaCapi: 'PageView' },
  product_view: { ga4: 'view_item', metaBrowser: 'ViewContent', metaCapi: 'ViewContent' },
  search: { ga4: 'search', metaBrowser: 'Search', metaCapi: 'Search' },
  add_to_cart: { ga4: 'add_to_cart', metaBrowser: 'AddToCart', metaCapi: 'AddToCart' },
  remove_from_cart: { ga4: 'remove_from_cart', metaBrowser: null, metaCapi: null },
  begin_checkout: { ga4: 'begin_checkout', metaBrowser: 'InitiateCheckout', metaCapi: 'InitiateCheckout' },
  add_payment_info: { ga4: 'add_payment_info', metaBrowser: 'AddPaymentInfo', metaCapi: 'AddPaymentInfo' },
  purchase: { ga4: 'purchase', metaBrowser: 'Purchase', metaCapi: 'Purchase' },
  signup: { ga4: 'sign_up', metaBrowser: 'CompleteRegistration', metaCapi: 'CompleteRegistration' },
  login: { ga4: 'login', metaBrowser: null, metaCapi: null },
  newsletter_signup: { ga4: 'sign_up', metaBrowser: null, metaCapi: null },
}

export function ga4EventName(name: CanonicalEventName): string | null {
  return EVENT_MAPPING[name].ga4
}

export function metaBrowserEventName(name: CanonicalEventName): string | null {
  return EVENT_MAPPING[name].metaBrowser
}

export function metaCapiEventName(name: CanonicalEventName): string | null {
  return EVENT_MAPPING[name].metaCapi
}
