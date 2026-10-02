# Zuulab E-Commerce — Operations Runbook

## 1. Current Status

- Production runs on Vercel + Neon, behind **maintenance mode** (only
  `MAINTENANCE_ALLOWED_IPS` and the admin can reach the storefront).
- Live: catalog, cart, checkout, PayTR payments (test mode), orders, stock, coupons,
  customer accounts, support, returns/refunds, admin panel.
- In progress: Uyumsoft e-invoicing (Phase 4), Sürat Kargo (Phase 5), marketplace stock/price
  product upload (Phase 7e; stores, listings, Trendyol order import and stock/price push are live),
  Inventory, production (3D print restocking) and filament stock run on the database;
  warehouse (WMS) and product-economics screens are switched off in the admin.

---

## 2. Go-Live Checklist

### Before opening the store
- [ ] All variables in `DEPLOYMENT.md` §2 set in Vercel Production; `/api/health/readiness`
      shows `configErrors: 0` and the logs show no `config.warning` you did not expect
- [ ] Migrations applied and `npx prisma db verify` passes
- [ ] **PayTR panel → notification (bildirim) URL** is exactly
      `https://www.zuulab.com/api/payments/webhook` (PayTR does not follow the
      `zuulab.com` → `www` redirect)
- [ ] Firebase Console → Authorized domains include `www.zuulab.com` and `dashboard.zuulab.com`
- [ ] Resend domain verified (SPF, DKIM, DMARC); `EMAIL_PROVIDER=RESEND`
- [ ] Uyumsoft `UYUMSOFT_ENV=PRODUCTION` with the production API user (after Phase 4)
- [ ] Sürat Kargo credentials and `SHIPPING_PROVIDER=SURAT` (after Phase 5)
- [ ] Remove test data: test products (`test-urun`, `e2e-otomatik-test-r-n`), test orders
      and test coupons
- [ ] Free-shipping threshold and coupons reviewed in the admin settings

### Switching to live payments
- [ ] `PAYTR_TEST_MODE=0`, redeploy
- [ ] One real low-value purchase: order shows **CONFIRMED** in the admin and in
      "Siparişlerim", stock decreased, confirmation email received
- [ ] Refund that order from the admin returns flow and confirm the refund in the PayTR panel
- [ ] Turn maintenance mode off in the admin settings

---

## 3. Incidents

| Situation | What the system does | What to do |
|---|---|---|
| **Database down** | API returns errors, readiness `503`; nothing half-written (transactions roll back). Catalog pages keep serving their last cached version. | Check Neon status / pooler; restore via point-in-time if data is damaged. |
| **PayTR down / token error** | Checkout shows "Ödeme altyapısına şu anda ulaşılamıyor", the order is marked `PAYMENT_FAILED` and its stock released; customer can retry from the failure page. | Check PayTR status; enable maintenance mode if prolonged. |
| **PayTR callback missing** | The payment page and the expiry job ask PayTR's status API; paid orders are confirmed (`PAYMENT_RECONCILED` in audit logs, reference `status-query:...`). | If you see many `status-query` confirmations, the PayTR notification URL is wrong (§2). |
| **Refund result unknown** | Return stays `REFUND_PENDING`, refund status `UNKNOWN`; never retried automatically. | Check the order's refund in the PayTR panel, then complete or fail the return manually. |
| **Payment captured twice** (two attempts paid) | Audit log `PAYMENT_DUPLICATE_CAPTURE`. | Refund the extra payment in the PayTR panel. |
| **Oversold** (late payment after stock ran out) | Order confirmed, stock goes negative, audit log `ORDER_OVERSOLD`. | Produce or restock, or contact the customer. |
| **Email provider down** | Orders continue; emails fail and are logged. | Check Resend status and the API key. |
| **Marketplace package waiting** ("x ürün eşleşmedi") | The package is kept; no site order and no stock change until every line is linked. | Admin → Pazaryeri → Ürün Eşleştirme: link or import the product, then "Bekleyenleri yeniden dene" (the next sync also retries). |
| **Marketplace order oversold** | The sale already happened on the marketplace, so the order is created and stock goes negative; audit log `ORDER_OVERSOLD`. | Produce or restock; correct the stock count. |
| **Marketplace rejected a stock/price update** | The listing shows "gönderim reddedildi" with Trendyol's reason on the matching page; it is sent again an hour later. | Fix the cause on Trendyol (e.g. locked product, price rule) or correct the store price. |
| **Marketplace orders not arriving** | Store row shows the last error; each sync is logged. | Check the store connection test, the external scheduler (cron-job.org) and `CRON_SECRET`. |
| **Unexpected server errors** | One `request.error` JSON line per error in Vercel logs (path, route, digest). | Filter Vercel logs by `"event":"request.error"`. |

---

## 4. Rollback

### Application
Vercel → Deployments → previous stable production deployment → **Instant Rollback**.
All migrations so far are additive, so older code runs against the newer schema.

### Database
Never drop tables by hand. Create a Neon branch/restore at a point before the incident,
point `DATABASE_URL` to it, redeploy, then verify `/api/health/readiness` and
`npx prisma db verify`.
