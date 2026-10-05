/**
 * ZUULAB canonical marketing events: one vocabulary for every user action that
 * analytics, ads and email tools care about. Browser and server code build events
 * with these types; destinations (GA4, Meta Pixel / CAPI, internal analytics, Resend…)
 * translate them on their own side (see ./mapping.ts). Nothing here knows about any
 * destination, so a Meta or GA4 name never leaks into the shop's own model.
 *
 * No server-only or browser-only imports: this file runs on both sides.
 */

export const CANONICAL_EVENTS = [
  'page_view',
  'product_view',
  'search',
  'add_to_cart',
  'remove_from_cart',
  'begin_checkout',
  'add_payment_info',
  'purchase',
  'signup',
  'login',
  'newsletter_signup',
] as const

export type CanonicalEventName = (typeof CANONICAL_EVENTS)[number]

/** Consent the visitor gave in the cookie banner, as stored by lib/consent.ts (null = no answer yet) */
export type EventConsent = 'all' | 'necessary' | null

export type PaymentMethodName = 'CARD' | 'BANK_TRANSFER' | 'CASH_ON_DELIVERY'

/** One product line. productId / variantId are the shop's own database ids. */
export interface MarketingItem {
  productId: string
  variantId?: string | null
  productName: string
  sku?: string
  category?: string
  /** Human label of the chosen variant, e.g. "Siyah / M" */
  variantLabel?: string | null
  quantity: number
  /** Unit price in `currency`, VAT included */
  price: number
}

/** Campaign parameters of the visit that brought the shopper (see ./attribution.ts) */
export interface UtmParams {
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmTerm?: string
  utmContent?: string
  /** Ad click ids, kept for later server-side matching (Meta CAPI fbc, Google gclid) */
  fbclid?: string
  gclid?: string
}

/**
 * Who the shopper is, for destinations that match events to a person (Meta CAPI hashes
 * these before sending). Only ever set on the server from a stored order; never logged.
 */
export interface EventUser {
  email?: string
  phone?: string
  firstName?: string
  lastName?: string
  city?: string
  postalCode?: string
  country?: string
}

/** Browser identifiers a server-side destination needs to match an event to an ad click */
export interface EventClient {
  ip?: string
  userAgent?: string
  /** Meta's _fbp / _fbc first-party cookies */
  fbp?: string
  fbc?: string
}

/**
 * The marketing context stored on an order at checkout (orders.attribution). `meta` holds
 * the Meta identifiers of that visit, kept so the server can send the purchase later.
 */
export interface OrderAttribution {
  last?: UtmParams
  first?: UtmParams
  meta?: EventClient
}

/**
 * The event as every destination receives it. Only the envelope (eventId, eventName,
 * timestamp, source) is always set; the rest depends on the event, see REQUIRED_FIELDS.
 */
export interface MarketingEvent extends UtmParams {
  /** Shared by the browser and server copies of one action, so Meta can deduplicate them */
  eventId: string
  eventName: CanonicalEventName
  /** Epoch milliseconds */
  timestamp: number
  /** Where this copy was produced */
  source: 'browser' | 'server'
  /** Consent at the time of the action; null/undefined = unknown (a server-side event with no browser) */
  consent?: EventConsent

  sessionId?: string
  anonymousId?: string
  /** The shop's `users.id`. ZUULAB has no separate customer record: the signed-in user is the customer. */
  userId?: string
  /** Reserved for a future customer entity; not populated today */
  customerId?: string
  pageUrl?: string
  referrer?: string

  // Single-product events (product_view, add_to_cart, remove_from_cart)
  productId?: string
  variantId?: string | null
  productName?: string
  sku?: string
  category?: string
  variantLabel?: string | null
  quantity?: number
  price?: number

  currency?: string
  orderId?: string
  /** Money value of the event; for `purchase` the total the customer paid */
  value?: number
  /** Multi-product events (begin_checkout, add_payment_info, purchase) */
  items?: MarketingItem[]

  // Extras for the events that need them
  searchTerm?: string
  /** signup / login / newsletter_signup: "email" | "google" | "bülten" */
  method?: string
  paymentMethod?: PaymentMethodName
  coupon?: string
  /** Shipping fee included in `value` (purchase) */
  shipping?: number

  /** Server-side only, see EventUser / EventClient */
  user?: EventUser
  client?: EventClient
}

/** Fields the caller supplies; envelope and identity fields are filled by the builder */
export type MarketingEventData = Omit<
  MarketingEvent,
  'eventId' | 'eventName' | 'timestamp' | 'source' | 'consent'
> & { eventId?: string }

/** Required fields per event. Everything else is optional for that event. */
export const REQUIRED_FIELDS: Record<CanonicalEventName, ReadonlyArray<keyof MarketingEvent>> = {
  page_view: ['pageUrl'],
  product_view: ['productId', 'productName', 'price', 'currency'],
  search: ['searchTerm'],
  add_to_cart: ['productId', 'productName', 'quantity', 'price', 'currency'],
  remove_from_cart: ['productId', 'productName', 'quantity', 'price', 'currency'],
  begin_checkout: ['items', 'value', 'currency'],
  add_payment_info: ['items', 'value', 'currency', 'paymentMethod'],
  purchase: ['orderId', 'items', 'value', 'currency'],
  signup: [],
  login: [],
  newsletter_signup: [],
}

export const DEFAULT_CURRENCY = 'TRY'

export function isCanonicalEvent(name: unknown): name is CanonicalEventName {
  return typeof name === 'string' && (CANONICAL_EVENTS as readonly string[]).includes(name)
}

/** A random id for one user action; browser and server may both use it as `eventId` */
export function newEventId(): string {
  const c = globalThis.crypto
  if (c?.randomUUID) return c.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

/**
 * The id of a purchase is derived from the order, never random: the browser
 * confirmation page, the payment callback, a webhook retry and a page reload all
 * produce the same id, so a destination (and Meta's dedupe) counts the order once.
 */
export function purchaseEventId(orderNumber: string): string {
  return `purchase_${orderNumber}`
}

/** The items of an event: its `items`, or the single product described by the flat fields */
export function itemsOf(event: MarketingEvent): MarketingItem[] {
  if (event.items && event.items.length > 0) return event.items
  if (event.productId && event.productName && event.price !== undefined) {
    return [
      {
        productId: event.productId,
        variantId: event.variantId,
        productName: event.productName,
        sku: event.sku,
        category: event.category,
        variantLabel: event.variantLabel,
        quantity: event.quantity ?? 1,
        price: event.price,
      },
    ]
  }
  return []
}

/** Money is kept to two decimals so values summed on either side agree */
export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export function sumItems(items: MarketingItem[]): number {
  return roundMoney(items.reduce((s, i) => s + i.price * i.quantity, 0))
}

/** Missing required fields of an event; empty = valid */
export function missingFields(event: MarketingEvent): string[] {
  return REQUIRED_FIELDS[event.eventName].filter((field) => {
    const v = event[field]
    if (v === undefined || v === null || v === '') return true
    return Array.isArray(v) && v.length === 0
  }) as string[]
}

export interface EventContext {
  source: MarketingEvent['source']
  consent?: EventConsent
  now?: () => number
  /** Identity and page context known to the caller (browser: ids, url; server: none) */
  base?: Partial<MarketingEvent>
}

/**
 * Builds a full event from a name, event data and context. Explicit data wins over
 * context, so a caller that knows the real user id (right after sign-in) can pass it.
 * Undefined values are dropped so payloads stay small and comparable in tests.
 */
export function buildEvent(
  eventName: CanonicalEventName,
  data: MarketingEventData,
  ctx: EventContext
): MarketingEvent {
  const { eventId, ...rest } = data
  const merged: Record<string, unknown> = { ...ctx.base, ...rest }
  const event = {
    ...merged,
    eventId: eventId || newEventId(),
    eventName,
    timestamp: (ctx.now ?? Date.now)(),
    source: ctx.source,
    consent: ctx.consent ?? null,
  } as MarketingEvent
  for (const key of Object.keys(event) as Array<keyof MarketingEvent>) {
    if (event[key] === undefined) delete event[key]
  }
  return event
}
