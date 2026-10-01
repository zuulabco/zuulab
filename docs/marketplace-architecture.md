# ZUULAB E-Commerce — Marketplace Integration Architecture (Phase 16)

## 1. Executive Summary & Objective

The **Marketplace Integration Architecture** establishes a resilient, provider-agnostic, multi-store foundation designed to centralize order, inventory, catalog, and logistics operations across multiple external marketplace channels alongside ZUULAB's direct storefront.

```
                         ┌─────────────────────────────────────────┐
                         │              ZUULAB ADMIN               │
                         └────────────────────┬────────────────────┘
                                              │
                     ┌────────────────────────┴────────────────────────┐
                     ▼                                                 ▼
        ┌─────────────────────────┐                       ┌─────────────────────────┐
        │    DIRECT STOREFRONT    │                       │     MARKETPLACE HUB     │
        └─────────────────────────┘                       └────────────┬────────────┘
                                                                       │
                         ┌────────────────────┬────────────────────────┼────────────────────────┐
                         ▼                    ▼                        ▼                        ▼
                  ┌──────────────┐     ┌──────────────┐         ┌──────────────┐         ┌──────────────┐
                  │ HB Store 1   │     │ HB Store 2   │         │ TY Store 1   │         │ TY Store 2   │
                  │ (Ana Mağaza) │     │ (Yan Mağaza) │         │ (Ana Mağaza) │         │ (Butik)      │
                  └──────────────┘     └──────────────┘         └──────────────┘         └──────────────┘
                                              │                                                 │
                                              ▼                                                 ▼
                               ┌──────────────────────────────┐                  ┌──────────────────────────────┐
                               │     HepsiburadaProvider      │                  │       TrendyolProvider       │
                               │   (Offset / Limit Stream)    │                  │  (V2 OMS Cursor-Based Stream)│
                               └──────────────┬───────────────┘                  └──────────────┬───────────────┘
                                              │                                                 │
                                              └────────────────────────┬────────────────────────┘
                                                                       │
                                                                       ▼
                                                      ┌─────────────────────────────────┐
                                                      │     NORMALIZED STORE ENGINE     │
                                                      │  - Order Identity & Idempotency │
                                                      │  - Strict SKU/Barcode Mapping   │
                                                      │  - Masked Credential Vault      │
                                                      │  - Exponential Backoff & Jitter │
                                                      └─────────────────────────────────┘
```

---

## 2. Provider Abstraction Architecture

All marketplace operations are isolated behind the universal `IMarketplaceProvider` interface:

* **Location:** `src/lib/services/marketplace/marketplace.interface.ts`
* **Base Provider:** `src/lib/services/marketplace/providers/base.provider.ts`
* **Factory:** `src/lib/services/marketplace/provider.factory.ts`

### Provider Contract Summary
| Capability | Contract Method | Phase 16 State | Description |
| :--- | :--- | :--- | :--- |
| **Health Check** | `testConnection()` | **Active** | Validates credentials, merchant identifiers, and protocol handshake. |
| **Store Metadata** | `getStoreInfo()` | **Active** | Retrieves store operational metadata and default carrier settings. |
| **Order Fetch** | `fetchOrders(params)` | **Foundation** | Supports cursor (Trendyol) or offset/page (Hepsiburada) pagination. |
| **Order Details** | `fetchOrder(id)` | **Foundation** | Retrieves single order payload with raw payload isolation. |
| **Status Mapping** | `normalizeStatus(raw)`| **Active** | Converts provider-specific raw states to `NormalizedMarketplaceStatus`. |
| **Order Normalize**| `normalizeOrder(raw)` | **Active** | Converts marketplace JSON into typed `NormalizedMarketplaceOrder`. |
| **Catalog Sync** | `fetchProducts()` | *Phase 17+* | Throws `NotImplementedMarketplaceError` (explicit, no silent mock). |
| **Stock Sync** | `updateStock()` | *Phase 18* | Reserved for central inventory distribution. |
| **Price Sync** | `updatePrice()` | *Phase 18* | Reserved for channel-specific pricing tiers. |
| **Label Print** | `fetchLabel()` | *Phase 19* | ZPL, PDF, PNG, and JPG carrier label bridge. |

---

## 3. Provider Specifics & Official API Research

### 3.1 Hepsiburada (`HepsiburadaProvider`)
* **Developer Portal:** [Hepsiburada Developer Portal](https://developers.hepsiburada.com/tr/)
* **Base URL:**
  * Production: `https://mpop.hepsiburada.com`
  * Staging: `https://mpop-sit.hepsiburada.com`
* **Pagination Strategy:** Offset-based (`page`, `size`).
* **Authentication:** API Key / Basic Auth headers.
* **Rate Limiting:** Handled via HTTP 429 status and `X-RateLimit-*` headers with `Retry-After`.
* **Carrier & Packaging:** Tracks `packageNumber`, `merchantSku`, `lineItemId`, and `barcode`.

### 3.2 Trendyol (`TrendyolProvider`)
* **Developer Portal:** [Trendyol Developer Portal](https://developers.trendyol.com/)
* **Base URL:**
  * Production: `https://api.trendyol.com`
  * Staging: `https://stageapi.trendyol.com`
* **Authentication:** Basic Auth (`Authorization: Basic base64(apiKey:apiSecret)`).
* **CRITICAL V2 ARCHITECTURE:**
  * The legacy endpoint `/integration/order/sellers/{sellerId}/orders` is scheduled for **deprecation on 15 October 2026**.
  * ZUULAB targets the modern **V2 OMS Endpoint**: `/integration/oms/core/sellers/{sellerId}/orders`.
* **Pagination Strategy:** Cursor-based order stream (`cursor`, `nextCursor`, `lastModified`, `orderByDirection=ASC`).

---

## 4. Multi-Store Architecture & Database Design

Stores are represented as database-driven dynamic entities (`MarketplaceStore`), never as hardcoded enums.

```prisma
enum MarketplaceProvider {
  HEPSIBURADA
  TRENDYOL
  AMAZON
  EPTTAVM
  ETSY
}

enum MarketplaceStoreStatus {
  ACTIVE
  INACTIVE
  ERROR
  PENDING
}

enum NormalizedMarketplaceStatus {
  NEW
  APPROVED
  PREPARING
  SHIPPED
  DELIVERED
  CANCELLED
  RETURNED
  UNMAPPED
}
```

### Initial Pre-Configured Multi-Store Channels:
1. `store-hb-1`: Hepsiburada Mağaza 1 (Merchant ID: `hb-merch-001`, `STAGE`)
2. `store-hb-2`: Hepsiburada Mağaza 2 (Merchant ID: `hb-merch-002`, `STAGE`)
3. `store-ty-1`: Trendyol Mağaza 1 (Supplier ID: `ty-supp-1001`, `STAGE`)
4. `store-ty-2`: Trendyol Mağaza 2 (Supplier ID: `ty-supp-1002`, `STAGE`)
5. Direct Storefront: Native ZUULAB checkout order channel.

---

## 5. Security & Masked Credential Vault

1. **Zero Plaintext Secrets:** API keys and secrets are never committed to git, never exposed in client API responses, and never logged.
2. **Masked Display:** Admin dashboard always presents secrets as `••••••••••••`.
3. **Rotation Support (`rotateStoreCredentials`):**
   * Incrementally updates credential version (`version: N+1`).
   * Updates `lastRotatedAt`.
   * Emits audit event `marketplace.credentials.rotated` containing store ID and version without logging secret strings.
4. **Duplicate Merchant Protection:** Registration prevents duplicate store creation with identical `(provider, externalMerchantId, environment)`.
5. **RBAC Guard:** All marketplace endpoints enforce `requireAdmin(request)` with `MARKETPLACE_VIEW` and `MARKETPLACE_MANAGE` permissions.

---

## 6. Product Mapping & Strict SKU Rule

To eliminate inventory contamination and mismatched shipments:
* **Strict Rule:** Direct product name matching is **strictly forbidden**.
* Product mappings require explicit alignment between ZUULAB's internal `Product.sku` or `Product.barcode` and the marketplace seller SKU (`merchantSku` / `externalSku`).
* Uniqueness constraint on `(storeId, externalSku)` guarantees a 1-to-1 relationship per store.

---

## 7. Order Identity & Idempotent Ingestion

Marketplace orders preserve their external identity:
* **Unique Identity:** `(storeId, externalOrderId)`.
* **Line Item Identity:** `(marketplaceOrderId, externalLineItemId)`.
* **Idempotency Guarantee:**
  * Re-processing an existing order payload updates mutable fields (`status`, `lastModifiedAt`, `syncedAt`) without creating duplicate records (`action: 'UPDATED'` or `'UNCHANGED'`).
  * New orders generate a distinct `MarketplaceOrder` record with line items (`action: 'CREATED'`).

---

## 8. Error Normalization & Rate Limiting

The system introduces `MarketplaceError` to standardize provider exceptions:
* `AUTHENTICATION_ERROR`
* `AUTHORIZATION_ERROR`
* `RATE_LIMITED` (Includes `retryAfterSeconds`)
* `VALIDATION_ERROR`
* `NOT_FOUND`
* `TEMPORARY_ERROR`
* `PROVIDER_ERROR`
* `NOT_CONFIGURED`
* `NOT_IMPLEMENTED`

### Exponential Backoff & Jitter
```typescript
executeWithRetryAndBackoff(fn, provider, {
  maxRetries: 3,
  initialDelayMs: 500,
  maxDelayMs: 10000,
  factor: 2,
  jitter: true, // Full jitter prevents thundering herd
})
```

---

## 9. Roadmap for Future Phases

| Phase | Milestone | Focus Areas |
| :--- | :--- | :--- |
| **Phase 16** (Current) | **Foundation & Architecture** | Provider contracts, multi-store (2+2), credentials vault, mapping, idempotency, Admin UI. |
| **Phase 17** | **Order Ingestion & Sync** | Background worker, webhook listeners, automated cursor advancement, order reconciliation. |
| **Phase 18** | **Central Stock & Inventory** | Two-way inventory lock, multi-store stock reservation, low-stock threshold broadcast. |
| **Phase 19** | **Shipping & Cargo Labels** | Marketplace cargo barcode generation, thermal print formatting (ZPL/PDF 10x10), tracking webhooks. |
| **Phase 20** | **E-Invoice & Reconciliation** | Marketplace commission tracking, e-invoice upload to HB/TY seller portals. |
