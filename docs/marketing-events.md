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

## Product analytics (Phase 7)

Admin page `/marketing/products`, API `GET /api/admin/insights/products`. Code: `lib/analytics/product-insights.ts`
(rules), `lib/services/analytics/product-analytics.service.ts` (queries).

- Per product: viewers and views, cart adders, checkout starters, consented buyers, orders, units, revenue, average
  selling price, view→cart / cart→checkout / conversion rates, and where its sales came from (the order's last campaign
  touch). Every number also comes with the previous period.
- A checkout holding several products is stored as one `begin_checkout` row plus one `begin_checkout_item` row per
  product, so product-level checkout counts exist. The extra rows have their own name and do not touch visitor or funnel
  counts. (Data starts when this shipped; older checkouts have no per-product rows.)
- Rankings: most viewed, most added to cart, best selling.
- Opportunities, only for products at least 10 visitors have seen: **high views, low sales** (never sold, or converting at
  less than half the shop's rate; a product sold only to visitors we cannot follow is not called weak) and **high sales,
  low traffic** (converting at twice the shop's rate or more while few people see it).

## E-mail center (Phase 8)

Admin page `/marketing/email`, API `/api/admin/email`, Resend webhook `/api/webhooks/resend`. Code:
`lib/email/campaign.ts` (rules), `lib/services/email-campaign.service.ts`.

- **Campaigns** are plain structured text (heading, paragraphs, optional button), escaped into the shop's own template, so
  no markup or script can be injected and the unsubscribe footer is always there. Button links must be https.
- **Audience:** subscribers whose address is confirmed (`ACTIVE`). Every mail carries its own unsubscribe link (page and
  one-click `List-Unsubscribe`); the message id is in the link so an unsubscribe is counted against that mail.
- **Sending:** a test mail goes to one address and is not recorded. A campaign is sent once (`DRAFT -> SENDING` is one
  conditional update). The admin confirms the recipient count on screen, and that number must still match when the send
  starts. Mails go out in groups of 50 through Resend's batch endpoint (the account allows 2 requests per second). If not a
  single mail goes out the campaign returns to draft so it can be retried.
- **Statistics** come from the Resend webhook (Svix-signed, secret `RESEND_WEBHOOK_SECRET`, 5-minute replay window, each
  delivery handled once): delivered, opened, clicked, bounced, complained. A permanent bounce or a spam complaint
  unsubscribes the address. An event for a mail we do not know is ignored, unless it is tagged as a campaign mail, then
  Resend is asked to retry. Opens are an estimate (mail apps that preload images count as opens).
- **Resend setup (once):** webhook URL `https://<site>/api/webhooks/resend` with the events `email.delivered`,
  `email.opened`, `email.clicked`, `email.bounced`, `email.complained`, `email.failed`; and open / click tracking enabled
  for the sending domain.

## E-mail automation (Phase 9)

Two automatic mails, managed under Pazarlama > E-posta > Otomatik e-postalar. Code: `lib/email/automations.ts` (rules,
texts), `lib/services/email-automation.service.ts`, job `GET /api/cron/email-automations`.

- **One permission, the newsletter is a topic on top of it.** The permission is the single commercial-e-mail consent
  (`email_consents`, `lib/services/email-consent.service.ts`): campaigns, offers, reminders, review requests. The newsletter
  (`newsletter_subscribers`, double opt-in) is an extra topic: newsletter-only content goes only to subscribers, the automations go
  to everyone with the permission. Three ways in, each an unticked box or an explicit "yes": (1) the newsletter form, once confirmed
  (gives both; only when the sign-up saw the current wording, which mentions reminders); (2) a signed-in member, in the modal after
  sign-in (`EmailConsentModal`, `/api/account/email-consent`; only for a verified address; "no" is saved as DECLINED, closing it gives
  nothing and asks again after 14 days in that browser) or under Hesabım > Profilim > e-posta tercihleri (`EmailPreferences`); (3)
  anyone, in the optional box on the payment page (hidden for a member who already gave it). Text / time / IP / browser are kept as
  proof. **One way out:** the link in any commercial mail (newsletter or automatic) withdraws the permission and unsubscribes the
  newsletter too (`withdrawEmailConsent` / `unsubscribeNewsletter`); the member can switch it on again in the account. A guest who
  never ticked a box gets no commercial e-mail (only order and shipping mail).
- **Unpaid-order reminder** (`abandoned_payment`): an unpaid card order 3 to 24 hours old, only for addresses with the e-mail
  permission. Left out: bank-transfer orders, payments under way or paid, addresses that bought
  since, a second reminder within 7 days. Only the latest such order per address. No discount, no fake deadline.
- **Review request** (`review_request`): an order delivered 7 to 30 days ago (delivery date from `order_status_history`), only for
  addresses with the e-mail permission; no promotion in it. (`email_optouts` from the first version of this phase is no longer used.)
- **Restraint, in code:** one mail per order and automation (the database refuses a second claim), one automatic mail per address
  every 3 days across automations, nothing between 21:00 and 09:00 Türkiye time (it waits for the morning), each run sends at most 25
  per automation. A failed send is recorded and not retried by itself (it may have been accepted, a retry could mail twice).
- **Off until switched on** in the admin (each automation row is `PAUSED` by default). The admin shows how many people a rule
  would mail right now and can send a sample to the admin's own address.
- **Scheduling:** Vercel runs the job daily at 06:00 UTC (09:00 Türkiye). For the 3-hour reminder to arrive on time also call
  `/api/cron/email-automations` every 30 minutes from cron-job.org (`Authorization: Bearer <CRON_SECRET>`).
- Automations reuse the campaign tables (`kind = AUTOMATION`), so Resend's webhook and the statistics work the same way.

## Master switch for commercial e-mail

`COMMERCIAL_EMAIL_ENABLED` (env, default off, `lib/email/policy.ts`). While it is not "true": `sendCampaign` refuses, an automation cannot be
switched on and `runAutomations` treats every automation as paused even if its row says ACTIVE. Still working: order / payment /
shipping mails (not commercial), previews, the sample and test mails an admin sends to their own address, all reports. The
switch also covers **collecting the e-mail permission**: while it is off, the modal after sign-in, the payment-page box and the
account preferences do not appear (`useCommercialEmail` asks `GET /api/email/features`), the server refuses to record a permission
(`grantEmailConsent`, the account API, the payment route), the newsletter keeps its original consent wording and confirming it
gives no permission, and the commercial-message page and KVKK notice describe only the newsletter. Withdrawing a permission and
unsubscribing always work. Set it to
`true` in Vercel once İYS registration is done and the consent texts are approved.

## Retention (privacy)

`/api/cron/privacy-cleanup` (daily 02:30 UTC, `lib/services/privacy-retention.service.ts`): the browser identifiers kept with an order for
Meta (IP, browser, _fbp, _fbc; `orders.attribution.meta`) are removed after 30 days, `marketing_events` rows after 425 days. The cookie
policy, the open-consent text and the KVKK notice state the same periods; change them together.

## Adding a destination

Implement `Destination` (`id`, `consent`, `accepts`, `send`), register it on `browserDispatcher`
(`client.ts`) or `serverDispatcher` (`server.ts`), add its names to `mapping.ts`. Callers do not change.
Secrets for server destinations stay in server-only env vars (never `NEXT_PUBLIC_`).

## Debugging

`MARKETING_EVENT_DEBUG=1` makes the server dispatcher log every server-side event to the console.
