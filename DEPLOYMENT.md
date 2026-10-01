# Zuulab E-Commerce Platform — Production & Staging Deployment Guide

## 1. Deployment Architecture

```text
GitHub (main branch)
   ↓ (Vercel Git Integration / Deploy-on-push)
Vercel Edge / Serverless Functions
   ↓
Next.js 16.3.6 (App Router + Turbopack)
   ↓
Managed PostgreSQL (Prisma ORM 8)
```

### Connected External Services
- **Authentication**: Firebase Authentication & Firebase Admin SDK (Serverless token verification)
- **Asset Storage & CDN**: Cloudinary Media Management
- **Payment Gateways**: PayTR (Primary iFrame & Direct API), iyzico (Alternative)
- **E-Invoicing**: Uyumsoft e-Fatura & e-Arşiv SOAP Service
- **Multi-Carrier Shipping**: Sürat Kargo (SOAP Web Service) & Yurtiçi Kargo (KOPS Dispatcher)
- **Transactional Notifications**: Resend API (Verified Domain)
- **Scheduled Tasks**: Vercel Cron (`CRON_SECRET` protected)
- **Error Tracking & Observability**: Sentry Error Monitoring & Structured JSON Logs

---

## 2. Environment Configuration Matrix

The platform is strictly isolated across three tiers: `development`, `staging`, and `production`.

### Variable Reference
| Variable | Environment | Description |
|---|---|---|
| `DATABASE_URL` | Staging / Prod | Managed PostgreSQL connection string (pool-enabled) |
| `NEXT_PUBLIC_APP_URL` | Staging / Prod | Canonical HTTPS domain (e.g. `https://zuulab.com`) |
| `NEXT_PUBLIC_FIREBASE_*` | All | Public Firebase Client SDK configuration |
| `FIREBASE_PROJECT_ID` | Staging / Prod | Firebase Admin SDK Project ID |
| `FIREBASE_CLIENT_EMAIL` | Staging / Prod | Firebase Admin Service Account email |
| `FIREBASE_PRIVATE_KEY` | Staging / Prod | PEM-formatted private RSA key (escaped newlines) |
| `PAYMENT_PROVIDER` | Staging / Prod | `PAYTR` (Production default) or `IYZICO` |
| `PAYTR_MERCHANT_ID` | Staging / Prod | PayTR Merchant ID |
| `PAYTR_MERCHANT_KEY` | Staging / Prod | PayTR Secret Key |
| `PAYTR_MERCHANT_SALT` | Staging / Prod | PayTR Hash Salt |
| `PAYTR_TEST_MODE` | Staging: `1` / Prod: `0` | Controls live payment processing |
| `INVOICE_PROVIDER` | Staging / Prod | `UYUMSOFT` |
| `UYUMSOFT_ENV` | Staging: `TEST` / Prod: `PRODUCTION` | Endpoint selector |
| `UYUMSOFT_USERNAME` | Staging / Prod | Uyumsoft web service username |
| `UYUMSOFT_PASSWORD` | Staging / Prod | Uyumsoft web service password |
| `SHIPPING_PROVIDER` | Staging / Prod | Default outbound carrier (`SURAT` / `YURTICI`) |
| `OUTBOUND_SHIPPING_PROVIDER` | Staging / Prod | Outbound fulfillment carrier |
| `RETURN_SHIPPING_PROVIDER` | Staging / Prod | Reverse logistics return carrier |
| `SURAT_CUSTOMER_CODE` | Staging / Prod | Sürat Kargo customer code |
| `SURAT_PASSWORD` | Staging / Prod | Sürat Kargo web service password |
| `YURTICI_WS_USERNAME` | Staging / Prod | Yurtiçi Kargo web service username |
| `YURTICI_WS_PASSWORD` | Staging / Prod | Yurtiçi Kargo web service password |
| `EMAIL_PROVIDER` | Staging: `MOCK` or `RESEND` / Prod: `RESEND` | Active email provider |
| `RESEND_API_KEY` | Staging / Prod | Resend REST API key (`re_...`) |
| `RESEND_FROM_EMAIL` | Staging / Prod | Verified sender (e.g. `ZUULAB <siparis@zuulab.com>`) |
| `CLOUDINARY_CLOUD_NAME` | All | Cloudinary cloud namespace |
| `CLOUDINARY_API_KEY` | Staging / Prod | Cloudinary API Key |
| `CLOUDINARY_API_SECRET`| Staging / Prod | Cloudinary API Secret |
| `CRON_SECRET` | Staging / Prod | 64+ char random hex bearer token |
| `SENTRY_DSN` | Staging / Prod | Sentry error monitoring DSN |

---

## 3. Database Migration Deployment Procedure

Zuulab uses **Prisma ORM 8** with on-disk migration packages.

### Rules:
1. **NEVER run `prisma migrate dev` in staging or production.**
2. All database schema migrations are applied deterministically using:
   ```bash
   npx prisma db migrate
   ```
   Or explicitly targeting connection:
   ```bash
   npx prisma db migrate --db "$DATABASE_URL"
   ```
3. Verify on-disk migration graph and artifact integrity:
   ```bash
   npx prisma migration check
   npx prisma migration list
   ```
4. Current verified migration package:
   - `migrations/app/20260928T2341_add_returns_rma_shipment_events` (135 atomic schema operations)

---

## 4. Health Check Endpoints

- **Liveness Probe**: `GET /api/health/liveness`
  - Instant process health check for Vercel / Kubernetes load balancers.
  - Returns `200 OK` `{ "status": "ok", "liveness": true }`.
- **Readiness Probe**: `GET /api/health/readiness`
  - Validates active database connection and runtime configuration.
  - Returns `200 OK` `{ "status": "ok", "database": "connected", "readiness": true }` or `503 Service Unavailable`.
  - Zero sensitive database connection URLs or stack traces are exposed.

---

## 5. Scheduled Cron Jobs & Concurrency Safety

Vercel Cron triggers the following endpoints with `Authorization: Bearer $CRON_SECRET`:
1. `/api/cron/payment-expiration`: Cancels abandoned orders and releases inventory reservations.
2. `/api/cron/inventory-cleanup`: Releases expired stock holds.
3. `/api/cron/shipping-sync`: Polls carrier tracking web services for delivery progress.
4. `/api/cron/notifications-process`: Flushes pending and failed email queues with idempotency.

### Concurrency Protection:
- All cron endpoints utilize `acquireCronLock(jobName, ttlSeconds)` backed by the PostgreSQL `Setting` table.
- Simultaneous invocations across multiple serverless instances detect active locks and exit safely with `409 Conflict`, preventing duplicate notifications or race conditions.

---

## 6. Security & Hardening Controls

1. **Security Headers**: Configured in `next.config.ts`:
   - `Content-Security-Policy` with white-listed domains for Cloudinary, Firebase, PayTR, and Google Fonts.
   - `X-Frame-Options: SAMEORIGIN` (allows 3D-Secure payment authentication).
   - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
   - `X-Content-Type-Options: nosniff`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
2. **Production Mock Guards**:
   - SURAT, YURTICI, PAYTR, IYZICO, UYUMSOFT, and RESEND throw explicit configuration errors when unconfigured in production. Silent mock fallback is forbidden.
3. **Secret Sanitization**:
   - `sanitizeContext()` recursively redacts passwords, tokens, API keys, CVVs, and credit card numbers from all error logs and Sentry alerts.
4. **SEO & Privacy**:
   - `src/app/robots.ts` disallows indexing of `/admin`, `/hesap`, `/sepet`, `/odeme`, and `/api`.

---

## 7. PostgreSQL Backup & Disaster Recovery Plan

### Automated Backups
- Managed database provider (e.g. Neon / Supabase / AWS RDS) daily snapshot + Point-In-Time-Recovery (PITR) up to 7-30 days.

### Restore Procedure
1. Create a fresh PostgreSQL instance or restore to a point in time before incident:
   ```bash
   # If restoring from logical dump:
   pg_restore --clean --no-acl --no-owner -h <host> -U <user> -d <dbname> backup.dump
   ```
2. Verify migration consistency:
   ```bash
   npx prisma migration check
   npx prisma db migrate --show
   ```
3. Update `DATABASE_URL` in Vercel project environment variables.
4. Redeploy latest production release on Vercel.
5. Verify `/api/health/readiness` returns status `200 OK` and `"database": "connected"`.
