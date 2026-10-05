# Marketing events (Phase 1)

One shared model for every user action that analytics, ads and email tools care about.
Code lives in `src/lib/marketing/`.

```
 browser action ──trackEvent()──┐                       ┌─ GA4 (gtag)            live
 (cart, product, search, …)     ├─ build + identity ──► dispatcher ──► consent ──┼─ Meta Pixel            later
 server sale (payment confirmed)┘   (MarketingEvent)     best effort   per dest. ├─ Meta CAPI (server)    later
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

## Adding a destination

Implement `Destination` (`id`, `consent`, `accepts`, `send`), register it on `browserDispatcher`
(`client.ts`) or `serverDispatcher` (`server.ts`), add its names to `mapping.ts`. Callers do not change.
Secrets for server destinations stay in server-only env vars (never `NEXT_PUBLIC_`).

## Debugging

`MARKETING_EVENT_DEBUG=1` makes the server dispatcher log every server-side event to the console.
