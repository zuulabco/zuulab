# Zuulab E-Commerce Platform — Deployment Guide

## 1. Deployment Architecture

```text
GitHub (main branch)
   ↓ Vercel Git integration (deploy on push)
Vercel Serverless Functions
   ↓
Next.js 16.3.6 (App Router + Turbopack)
   ↓
Neon PostgreSQL (Prisma ORM 8)
```

- Canonical host: **https://www.zuulab.com** (`zuulab.com` 308-redirects to `www`).
- Admin panel: **https://dashboard.zuulab.com** (`/admin` on the storefront redirects there).

### Connected External Services
- **Authentication**: Firebase Authentication (client) + Firebase Admin SDK (token verification)
- **Payments**: PayTR iFrame (only supported gateway)
- **E-Invoicing**: Uyumsoft e-Fatura / e-Arşiv (integration in progress — Phase 4)
- **Shipping**: Sürat Kargo (integration in progress — Phase 5; carriers currently `MOCK`)
- **Email**: Resend
- **Media**: Cloudinary
- **Scheduled tasks**: Vercel Cron (`CRON_SECRET`)
- **Logs**: Vercel runtime logs. Server errors are written as one JSON line each
  (`event: "request.error"`) by `src/instrumentation.ts`; configuration problems as
  `event: "config.invalid"` / `"config.warning"` at server start. No Sentry SDK is installed.

---

## 2. Environment Variables (Vercel → Settings → Environment Variables)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | Neon pooled connection string |
| `NEXT_PUBLIC_APP_URL` | yes | `https://www.zuulab.com` (sitemap, metadata) |
| `NEXT_PUBLIC_DASHBOARD_URL` | no | Admin panel URL, default `https://dashboard.zuulab.com` |
| `NEXT_PUBLIC_FIREBASE_*` | yes | Firebase client config |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | yes | Firebase Admin service account |
| `AUTH_SESSION_SECRET` | yes | 32+ random bytes; signs the `.zuulab.com` session cookie |
| `ADMIN_BOOTSTRAP_EMAILS` | no | Comma-separated emails that get ADMIN on first verified sign-in |
| `PAYMENT_PROVIDER` | no | `PAYTR` (default). `SANDBOX` is refused in production |
| `PAYTR_MERCHANT_ID`, `PAYTR_MERCHANT_KEY`, `PAYTR_MERCHANT_SALT` | yes | PayTR merchant credentials |
| `PAYTR_TEST_MODE` | yes | `1` while testing, **`0` for live sales** |
| `INVOICE_PROVIDER` | yes | `UYUMSOFT` |
| `UYUMSOFT_ENV` | yes | `TEST` or `PRODUCTION` |
| `UYUMSOFT_USERNAME`, `UYUMSOFT_PASSWORD` | yes | Uyumsoft web service (Integration) user |
| `SHIPPING_PROVIDER`, `OUTBOUND_SHIPPING_PROVIDER`, `RETURN_SHIPPING_PROVIDER` | yes | `SURAT` once Phase 5 is done |
| `SURAT_CUSTOMER_CODE`, `SURAT_PASSWORD`, `SURAT_WEB_SERVICE_URL` | yes | Sürat Kargo web service |
| `SHIPPING_WEBHOOK_SECRET` | yes | HMAC key for carrier webhooks; without it carrier webhooks are rejected |
| `TRENDYOL_WEBHOOK_SECRET`, `HEPSIBURADA_WEBHOOK_SECRET` | when used | Credential the marketplace echoes on webhooks |
| `MARKETPLACE_CREDENTIALS_KEY` | for marketplaces | 32 random bytes (`openssl rand -base64 32`); encrypts the marketplace API keys stored in the database. Changing it makes saved keys unreadable (re-enter them in the admin) |
| `EMAIL_PROVIDER` | yes | `RESEND` in production (`MOCK` sends nothing) |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | yes | Resend key and verified sender |
| `COMMERCIAL_EMAIL_ENABLED` | no (default off) | Master switch for commercial e-mail: newsletter campaigns and the automatic reminder / review mails are refused unless this is `true`. Keep it unset until İYS registration is done. Order, payment and shipping mails are not affected |
| `RESEND_WEBHOOK_SECRET` | for campaign stats | Signing secret (`whsec_…`) of the Resend webhook that points at `/api/webhooks/resend`. Without it, newsletter campaigns still send but delivered / opened / clicked / bounced are not recorded |
| `SUPPORT_INBOX_EMAIL` | yes | Receives new support tickets and contact-form messages |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | yes | Media uploads |
| `CRON_SECRET` | yes | Bearer token for `/api/cron/*` |
| `MAINTENANCE_ALLOWED_IPS` | no | IPs that bypass maintenance mode |

After changing variables, redeploy (Deployments → latest → Redeploy).
`GET /api/health/readiness` reports `configErrors` / `configWarnings` counts; the
messages themselves are in the server logs.

---

## 3. Database Migrations

Prisma ORM 8 with on-disk migration packages in `migrations/app/`.

1. Never run `prisma db update` against production except to reconcile documented drift.
2. Apply pending migrations **before** deploying code that needs them:
   ```bash
   npx prisma db migrate --advance-ref db
   npx prisma db verify          # "Database marker and schema match contract"
   ```
3. Check the graph: `npx prisma migration check`, `npx prisma migration list`.
4. Current migrations:
   - `20260928T2341_add_returns_rma_shipment_events` — baseline
   - `20261002T1021_reconcile_contract_drift` — tables the contract had but the DB lacked
   - `20261002T1024_checkout_persistence` — order/payment persistence, stock state
   - `20261002T1025_coupon_limits` — coupon max discount, usage uniqueness
   - `20261002T1454_support_message_authors` — support message authors, ticket channel
   - `20261002T1456_rate_limits` — shared rate-limit counters
   - `20261002T1749_marketplace_stores` — marketplace stores and encrypted API credentials
   - `20261002T1932_marketplace_listings` — marketplace listings, their links to site products and store prices
   - `20261002T2024_marketplace_orders` — marketplace packages and the site orders created from them
   - `20261002T2151_marketplace_push` — stock/price push state per listing and push batches
   - `20261003T1037_campaigns_materials` — campaigns and production materials
   - `20261003T1343_variants_material_care` — variant options, per-combination photo, material care text
   - `20261003T1942_newsletter` — newsletter subscribers and welcome codes
   - `20261004T0924_variant_images` — several photos per variant (`product_variants.images`)
   - `20261005T1329_order_marketing_attribution` — `orders.marketing_consent`, `anonymous_id`, `attribution` (checkout marketing context, all nullable)
   - `20261005T1615_marketing_events` — `marketing_events`: the shop's own event log for internal analytics (new table only)
   - `20261005T1811_email_automations` — `email_campaigns.kind / automation_key`, `email_messages.order_id` (one mail per order and automation), `email_optouts` (additive)
   - `20261005T1712_email_campaigns` — `email_campaigns`, `email_messages`, `email_webhook_events`: newsletter campaigns, one row per mail with its Resend status, handled webhook deliveries (new tables only)

---

## 4. Health Checks

- `GET /api/health/liveness` → `200 {"status":"ok"}`
- `GET /api/health/readiness` → `200` when the database answers, else `503`;
  includes `configErrors` / `configWarnings` counts. No secrets are exposed.

---

## 5. Scheduled Jobs

`vercel.json` schedules (Hobby plan allows daily jobs):

| Path | Schedule | Purpose |
|---|---|---|
| `/api/cron/payment-expiration` | daily 03:00 UTC | Backstop: expire unpaid orders and release their stock |
| `/api/cron/marketplace-orders-sync` | daily 04:30 UTC | Backstop: import marketplace orders, then push stock/prices to stores whose switches are on |
| `/api/cron/privacy-cleanup` | daily 02:30 UTC | Removes marketing data past its retention period: browser identifiers (IP, browser, _fbp/_fbc) stored with an order after 30 days, visit records (`marketing_events`) after 14 months. Keep these numbers equal to the cookie policy and the KVKK notice |
| `/api/cron/email-automations` | daily 06:00 UTC (09:00 Türkiye) | Runs the e-mail automations that are switched on in the admin (unpaid-order reminder, review request). For the reminder to arrive about 3 hours after the order, also call it every 30 minutes from cron-job.org |

Vercel Hobby runs crons once a day, but marketplace orders should arrive within minutes.
Schedule the order import externally, e.g. cron-job.org every 10 minutes:
`GET https://www.zuulab.com/api/cron/marketplace-orders-sync` with header
`Authorization: Bearer <CRON_SECRET>`. Overlapping runs are safe (database lease per store).

The e-mail automations are safe to call as often as you like: a rule never mails the same order twice, an address gets
at most one automatic mail every 3 days, nothing goes out between 21:00 and 09:00 Türkiye time, and an automation that is
switched off in the admin does nothing.

Unpaid orders are also expired at every checkout, and each is reconciled with
PayTR's status API before expiring, so a paid order is never cancelled.
All cron routes require `Authorization: Bearer $CRON_SECRET` and take a database lease
(`settings` table, atomic), so concurrent runs on different instances never overlap.

---

## 6. Security Controls

1. **Headers** (`next.config.ts`): CSP (`frame-src 'self' https:` for bank 3-D Secure
   pages inside the PayTR iframe), HSTS, `nosniff`, referrer and permissions policies.
2. **Payments**: PayTR callbacks require PayTR's HMAC; the simulator only exists in
   local development without credentials. Lost callbacks are reconciled through PayTR's
   status API. Refunds use PayTR's refund API, capped at the amount paid.
3. **Auth**: identity only from verified Firebase tokens; linking an existing record by
   email requires a verified email; admin UI access is decided by the server.
4. **Rate limits** (Postgres-backed, shared by all instances): checkout, sign-in sync,
   coupon checks, cart quotes, search, guest order lookup, payment retry/status,
   support tickets, reviews, contact form (`src/lib/security/rate-limit-response.ts`).
5. **Webhooks**: carrier and marketplace webhooks require a shared secret in production.
6. **robots.txt** disallows `/admin`, `/hesap`, `/sepet`, `/odeme`, `/api`.

---

## 7. Backup & Recovery

- Neon keeps point-in-time history; set retention to at least 7 days.
- Restore: create a branch/instance at a time before the incident, point
  `DATABASE_URL` to it, redeploy, check `/api/health/readiness` and `npx prisma db verify`.

## Google sign-in window shows zuulab.com (not `<project>.firebaseapp.com`)

On the storefront (`SITE_URL`'s host, www.zuulab.com) Firebase's `authDomain` is switched to the shop's own host at
runtime (`src/lib/firebase-auth-domain.ts`) and `next.config.ts` passes `/__/auth/*` and `/__/firebase/*` on to
`<project>.firebaseapp.com`. One-time setup in the consoles, **before** deploying this change:

1. Google Cloud Console → APIs & Services → Credentials → the "Web client (auto created by Google Service)" OAuth client →
   **Authorized redirect URIs** → add `https://www.zuulab.com/__/auth/handler` (keep the existing firebaseapp.com one,
   the admin subdomain and previews still use it).
2. Firebase Console → Authentication → Settings → **Authorized domains**: `www.zuulab.com` and `zuulab.com` present.
3. Google Auth Platform → Branding: app name "ZUULAB", logo, support e-mail, authorized domain `zuulab.com`
   (this is the name Google prints on its own account page).

Without step 1 the Google button fails with `redirect_uri_mismatch` on www.zuulab.com. To roll back: remove the
`resolveAuthDomain` call in `src/lib/firebase.ts`.
