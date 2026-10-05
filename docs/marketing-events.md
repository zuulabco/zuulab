# Marketing events (Phase 1–2)

One shared model for every user action that analytics, ads and email tools care about.
Code lives in `src/lib/marketing/`.

```
 browser action ──trackEvent()──┐                       ┌─ GA4 (gtag)            live
 (cart, product, search, …)     ├─ build + identity ──► dispatcher ──► consent ──┼─ Meta Pixel            live
 server sale (payment confirmed)┘   (MarketingEvent)     best effort   per dest. ├─ Meta CAPI (server)    live
 emitPurchaseForOrder()                                                         ├─ internal analytics    later
                                                                                └─ Resend automations    later
```

- `events.ts` – canonical names, the `MarketingEvent` payload, required fields per event, event ids.
- `mapping.ts` – the only place that knows GA4 / Meta names.
- `dispatcher.ts` – destinations, per-destination consent, never throws, timeout, repeat filter.
- `client.ts` – browser entry `trackEvent(name, data)`; identity, campaign params, page.
- `server.ts` – server entry; `emitPurchaseForOrder(orderNumber)`.
- `purchase.ts` – builds the purchase from a stored order (pure).
- `attribution.ts` – UTM / click-id capture.

## Canonical events

`page_view`, `product_view`, `search`, `add_to_cart`, `remove_from_cart`, `begin_checkout`,
`add_payment_info`, `purchase`, `signup`, `login`, `newsletter_signup`.

Not added: `lead` (the contact form is a GA4-only `generate_lead`, kept as is), `view_cart`,
`select_item`, `add_to_wishlist`, `whatsapp_click`, `ui_click` (GA4-only report events, no shared meaning).

## Mapping

| ZUULAB            | GA4              | Meta browser         | Meta CAPI            |
| ----------------- | ---------------- | -------------------- | -------------------- |
| page_view         | page_view        | PageView             | PageView             |
| product_view      | view_item        | ViewContent          | ViewContent          |
| search            | search           | Search               | Search               |
| add_to_cart       | add_to_cart      | AddToCart            | AddToCart            |
| remove_from_cart  | remove_from_cart | –                    | –                    |
| begin_checkout    | begin_checkout   | InitiateCheckout     | InitiateCheckout     |
| add_payment_info  | add_payment_info | AddPaymentInfo       | AddPaymentInfo       |
| purchase          | purchase         | Purchase             | Purchase             |
| signup            | sign_up          | CompleteRegistration | CompleteRegistration |
| login             | login            | –                    | –                    |
| newsletter_signup | sign_up          | open (Lead/Subscribe)| open                 |

`page_view` is not sent by the browser GA4 adapter: GA4 enhanced measurement already counts it.

## Purchase

- Source of truth: the `orders` / `order_items` rows. Never the cart, the URL or the page.
- A sale is: card or havale payment confirmed (`handleSuccess`), or a kapıda ödeme order confirmed
  (`initiateCashOnDelivery`). Channel must be `DIRECT`. Statuses are listed in `purchase.ts`.
- `eventId` is `purchase_<orderNumber>`: browser copy, server copy, retries and reloads share it.
- Server copy: emitted from the two confirmation points above, which are compare-and-set guarded
  (once per order). Browser copy: `/api/marketing/purchase?order=` returns the event built from the DB
  (same access check as the payment status poll), the success page sends it once (localStorage guard).

## Meta (Phase 2)

Env (server only, see `lib/marketing/meta-config.ts`): `META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN`, optional
`META_CAPI_TEST_EVENT_CODE`. **Remove the test code in production once testing is done**: while it is set, server
events only appear under Events Manager → Test Events and do not count for ads.

- **Pixel** (`destinations/meta-pixel.ts`, loaded by `components/analytics/MetaPixel.tsx`): only after the cookie
  banner's "tümünü kabul et". Auto PageView on history change and auto-config are off; every event comes from the
  canonical layer with `eventID` = the canonical eventId.
- **CAPI** (`destinations/meta-capi.ts`, payload in `meta-capi-payload.ts`): server only. Email, phone, name, city,
  postal code, country and external id are normalised and SHA-256 hashed; IP, user agent, `_fbp`, `_fbc` go as is.
- **Purchase**: sent once from the stored order (`emitPurchaseForOrder`), same `purchase_<orderNumber>` id as the
  Pixel copy. Buyer data comes from the order snapshot; `_fbp`, `_fbc`, IP and user agent were stored with the order
  at checkout (`orders.attribution.meta`, only with consent).
- **Other events**: ViewContent, AddToCart, InitiateCheckout, AddPaymentInfo, CompleteRegistration are relayed by the
  browser to `POST /api/marketing/event` (consent read from the cookie, fixed field list, rate limited), which sends
  them with the same eventId. PageView and Search are browser-only. Not sent to Meta: newsletter_signup (open
  decision: Lead or Subscribe), login, remove_from_cart.
- No retry queue: a failed CAPI call is logged and dropped.

## Internal analytics (Phase 5)

The shop's own numbers, independent of Google and Meta. Code: `lib/analytics/internal.ts` (rules),
`lib/services/analytics/internal-analytics.service.ts` (queries), `GET /api/admin/insights`.

- **Two sources, on purpose.** `marketing_events` holds what visitors did (views, carts, checkouts), only for visitors
  who chose "tümünü kabul et". `orders` holds what was sold, so a sale is never lost to an ad blocker or a refused
  banner, and revenue can be checked against the admin's order list. `purchase` is never stored as an event.
- **Collection:** the browser sends every canonical event to `POST /api/marketing/collect` (consent read from the
  cookie, whitelisted fields, no user id from the body, page path without query string). Repeated event ids are
  stored once.
- **Rates are only computed inside one population:** conversion = consented buyers / consented visitors (not all
  orders / consented visitors). `trackedOrderShare` says how many orders belong to a consented visitor, i.e. how far
  the visitor numbers can be trusted.
- **Metrics:** visitors, sessions, funnel (visitor → product view → cart → checkout → payment info → buyer), orders,
  revenue (what customers paid, shipping included), average order value, conversion, cart and checkout abandonment
  (visitors who reached the step and have no consented sale in the period), per-product views / carts / buyers /
  units / revenue / conversion, daily trend, campaign sources (visitors from events, orders from the order's last
  touch).
- Periods are Turkish calendar days (UTC+3); an order belongs to the period it was placed in. Each report also
  returns the previous period of the same length.
- No retention job yet: rows are small (one per action); prune old ones when the table gets large.

## Adding a destination

Implement `Destination` (`id`, `consent`, `accepts`, `send`), register it on `browserDispatcher`
(`client.ts`) or `serverDispatcher` (`server.ts`), add its names to `mapping.ts`. Callers do not change.
Secrets for server destinations stay in server-only env vars (never `NEXT_PUBLIC_`).

## Debugging

`MARKETING_EVENT_DEBUG=1` makes the server dispatcher log every server-side event to the console.
