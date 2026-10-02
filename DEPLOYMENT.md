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

Unpaid orders are also expired at every checkout, and each is reconciled with
PayTR's status API before expiring, so a paid order is never cancelled.
All cron routes require `Authorization: Bearer $CRON_SECRET` and take a DB lock.

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
