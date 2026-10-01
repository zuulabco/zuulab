# Zuulab E-Commerce — Operational Incident & Outage Runbook

This document defines standard operating procedures across deployment environments, failure modes, data consistency states, automated retries, and administrator intervention protocols.

---

## 1. Environment Stages & Deployment Status

### CURRENT — DEVELOPMENT (Active Phase)
* **Status**: Currently active local development and testing environment.
* **Database**: Local development PostgreSQL database.
* **Authentication**: Firebase Client SDK + mock development tokens enabled in development mode.
* **External Providers**: Active fallback to mock/sandbox adapters for PayTR, Sürat Kargo, Yurtiçi Kargo, Uyumsoft e-Fatura, and Resend.
* **Mock Guard Guarantee**: Production mock fallback guards are active (`NODE_ENV === 'production'` strictly blocks mock execution and requires real external credentials).

### FUTURE — STAGING (Pre-Production Validation)
* **Goal**: Validate external APIs with vendor test/sandbox credentials before production.
* **Prerequisites**:
  * Vendor sandbox API keys (PayTR Test Merchant, Uyumsoft Test Endpoint, Sürat Test WS, Yurtiçi Test WS, Resend Test Domain).
  * Staging PostgreSQL instance with automated backups.
  * Preview deployment URL on Vercel (`preview-staging.zuulab.com`).
* **Validation**: Run end-to-end checkout, invoice XML generation, tracking query, and email dispatch against vendor sandboxes.

### FUTURE — PRODUCTION (Go-Live Rollout)
* **Goal**: Controlled live release on `https://zuulab.com`.
* **Prerequisites**: All production credentials provisioned in Vercel Environment Variables.
* **Procedure**: Sequential deployment, automated database migration, health endpoint verification, DNS propagation, and live smoke test.

---

## 2. Production Go-Live Readiness Checklist

Use this checklist during the final go-live phase before opening the storefront to public traffic:

- [ ] **Infrastructure & Database**
  - [ ] Managed PostgreSQL provisioned with SSL/TLS enforced
  - [ ] Automated daily backups enabled on database provider
  - [ ] Point-in-Time Recovery (PITR) verified and retention period set (>= 7 days)
  - [ ] Connection pooling enabled (e.g. pgBouncer / Neon pooler)
  - [ ] `DATABASE_URL` configured in Vercel Production Environment
  - [ ] Prisma migration applied via `npx prisma db migrate` (strictly no `prisma migrate dev` or `db push`)
  - [ ] Database schema verified (no dev seed applied)

- [ ] **Authentication & Security**
  - [ ] `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` configured in Vercel
  - [ ] Public Firebase web credentials configured in client environment variables
  - [ ] Authorized domains in Firebase Console updated to include `zuulab.com` and `www.zuulab.com`
  - [ ] Mock tokens verified to be strictly rejected in production
  - [ ] Admin RBAC verified: customer role blocked from `/admin/*` routes
  - [ ] Customer isolation verified: users cannot access foreign orders or RMA requests

- [ ] **Media & Assets**
  - [ ] Cloudinary production account provisioned (`CLOUDINARY_CLOUD_NAME`, `API_KEY`, `API_SECRET`)
  - [ ] Image upload smoke test verified (WebP, PNG, JPEG allowed; >5MB blocked)

- [ ] **Payment Integration**
  - [ ] `PAYTR_MERCHANT_ID`, `PAYTR_MERCHANT_KEY`, `PAYTR_MERCHANT_SALT` configured
  - [ ] PayTR callback URL configured in PayTR Merchant Panel: `https://zuulab.com/api/payments/webhook`
  - [ ] Webhook signature verification and idempotency verified
  - [ ] Controlled test transaction verified (explicit approval required)

- [ ] **Shipping & Carriers**
  - [ ] Outbound carrier credentials provisioned (`SURAT_CUSTOMER_CODE`, `SURAT_PASSWORD`, `SURAT_WEB_SERVICE_URL`)
  - [ ] Return carrier credentials provisioned (`YURTICI_WS_USERNAME`, `YURTICI_WS_PASSWORD`, `YURTICI_ENDPOINT_URL`)
  - [ ] Shipping label PDF generation and tracking status synchronization verified

- [ ] **E-Invoice & Accounting**
  - [ ] Uyumsoft production web service credentials provisioned (`UYUMSOFT_USERNAME`, `UYUMSOFT_PASSWORD`)
  - [ ] `UYUMSOFT_ENV` configured to `PROD`
  - [ ] Taxpayer lookup and UBL-TR XML generation verified (explicit approval required for live financial documents)

- [ ] **Notifications & Email**
  - [ ] Resend API key provisioned (`RESEND_API_KEY`)
  - [ ] Domain verification (SPF, DKIM, DMARC) confirmed for `zuulab.com` in Resend
  - [ ] `RESEND_FROM_EMAIL` set to `bilgi@zuulab.com`
  - [ ] Order confirmation and shipment tracking email delivery confirmed

- [ ] **Monitoring & Crons**
  - [ ] `SENTRY_DSN` configured for server and client
  - [ ] `CRON_SECRET` configured in Vercel Production Environment
  - [ ] Cron schedules verified in `vercel.json` and distributed lock verified
  - [ ] Health endpoints responding (`/api/health/liveness` -> 200, `/api/health/readiness` -> 200)

- [ ] **Domain & Networking**
  - [ ] Apex domain `zuulab.com` and `www.zuulab.com` mapped to Vercel
  - [ ] SSL/TLS certificate active and HTTP -> HTTPS 308 redirect verified
  - [ ] Canonical URLs, `robots.txt`, and `sitemap.xml` verified

---

## 3. Incident Overview Matrix & Failure Modes

| Disruption Type | System Behavior | Order State | Automated Retry | User Facing Message | Administrator Protocol |
|---|---|---|---|---|---|
| **Database Outage (PostgreSQL)** | API routes return 503; `/api/health/readiness` fails; mutations blocked. | Unchanged (Atomic transaction rollback). | Client network backoff. | "Hizmetlerimizde geçici bir kesinti yaşanmaktadır. Lütfen birkaç dakika sonra tekrar deneyin." | Managed PostgreSQL portalından instance/pooler durumunu denetle; read-replica failover veya PITR restore başlat. |
| **Payment Outage (PayTR / iyzico)** | Session oluşturulamaz veya webhook yanıt vermez; token alımı zaman aşımına uğrar. | `PAYMENT_PENDING` veya `PAYMENT_FAILED`. | Var (Manuel kullanıcı "Tekrar Dene" butonu). | "Ödeme sağlayıcısına şu anda ulaşılamıyor. Kartınızdan herhangi bir çekim yapılmadı." | PayTR Mağaza Paneli durumunu kontrol et; sağlayıcı çöküşü uzarsa `PAYMENT_PROVIDER=IYZICO` geçişi yap. |
| **Shipping Outage (Sürat / Yurtiçi)** | Kargo API SOAP servisi zaman aşımına uğrar; barkod/takip kodu üretilemez. | `CONFIRMED` veya `PREPARING` kalır (Asla düşürülmez). | Var (Admin tek tıkla sevkıyatı tekrar dener). | Müşteri sipariş onayını görür, takip kodu gecikmeli iletilir. | `/admin/shipping` üzerinden aktif kargo firmasını diğer anlaşmalı firmaya çevir (`SURAT` ↔ `YURTICI`). |
| **Invoice Outage (Uyumsoft)** | UBL-TR SOAP çağrısı 500 döner; fatura kaydı `FAILED` durumuna geçer. | Sipariş `CONFIRMED` / `SHIPPED` kalır (Fatura hatası siparişi iptal etmez). | Var (Admin faturayı "Yeniden Dene" ile tetikleyebilir). | Fatura PDF'i hazırlandığında hesabınızda görünecektir. | `/admin/invoices` listesinden `FAILED` faturaları filtrele; Uyumsoft portal bağlantısını onarıp toplu retry yap. |
| **Email Outage (Resend)** | Resend REST API bağlantısı başarısız olur; bildirim `FAILED` durumuna düşer. | Sipariş süreci aksamadan devam eder. | Var (Cron kuyruğu azami 3 defaya kadar otomatik dener). | Kullanıcı web arayüzünde sipariş onay sayfasını ve geçmişini görmeye devam eder. | `/admin/notifications` ekranından kuyruğu izle; API key limitlerini ve domain DNS durumunu kontrol et. |
| **Cloudinary Outage** | Yeni ürün/banner görseli yüklenemez; mevcut görseller Cloudinary CDN cache'inden servis edilir. | Siparişleri etkilemez. | İstemci yükleme hatası döner. | "Görsel yüklenirken bir hata oluştu." | Cloudinary status sayfasını kontrol et; acil durumlar için geçici alternatif CDN URL'si tanımla. |
| **Firebase Auth Outage** | Yeni giriş yapılamaz; mevcut ID token'ı olan kullanıcılar token expire olana kadar işlem yapabilir. | Misafir checkout veya mevcut oturumlar devam eder. | İstemci SDK otomatik retry uygular. | "Giriş servisinde geçici bir yoğunluk var. Lütfen birazdan tekrar deneyin." | Google Cloud / Firebase Status panosunu incele; yetkilendirme yapılandırmasını kontrol et. |
| **Vercel Edge Outage** | Edge network 5xx döner; DNS yönlendirmesi aksayabilir. | Veritabanı tutarlılığı korunur. | Vercel Multi-Region failover. | Cloudflare / Tarayıcı hata sayfası. | Vercel status sayfasını denetle; gerekirse DNS A/CNAME kayıtlarını yedek barındırmaya yönlendir. |

---

## 4. Emergency Escalation & Rollback Steps

### A. Instant Rollback of Vercel Deployment
1. Vercel Dashboard → `zuulab-e` → **Deployments** sekmesine git.
2. Bilinen son kararlı yayını (Previous Stable Production Deployment) bul.
3. Üç nokta menüsünden **"Instant Rollback"** seçeneğini tıkla.

### B. Database Schema Rollback Protocol
1. Eğer migration sonrasında veri tutarsızlığı veya şema çakışması tespit edilirse:
   * Asla doğrudan tablo silme işlemi yapma.
   * `npx prisma migration log` ile son uygulanan operasyonları listele.
   * Managed PostgreSQL sağlayıcısının Point-In-Time-Recovery (PITR) yedeğinden migration öncesi dakikaya yeni bir instance oluştur.
2. Yeni bağlantı dizesini (`DATABASE_URL`) Vercel ortamına tanımla ve projeyi redeploy et.

