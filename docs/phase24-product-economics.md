# ZUULAB Phase 24 — Product Economics & Profitability

## 1. Overview & Operational Philosophy

ZUULAB is an owner-operated 3D-printing and creative design e-commerce workshop producing items across toys, lighting, home organizers, and trend products. Phase 24 introduces a lean, deterministic **Product Economics & Profitability** engine that answers key operational questions:

* **What does this product approximately cost me to manufacture?**
* **What are the selling prices across channels (ZUULAB Direct, Trendyol, Hepsiburada)?**
* **What known deductions (marketplace commissions, shipping fees, payment gateway cuts) exist per channel?**
* **What estimated contribution margin remains after accounting for known costs?**
* **Which cost data points are actual, configured estimates, or currently unknown?**

### Non-Negotiable Invariants
1. **No Fake Accounting / Not an ERP:** ZUULAB does not implement general ledger accounting, tax depreciation, or balance sheets. This engine is an operational economics decision-support tool.
2. **Deterministic Decimal Arithmetic:** Calculations use minor units (kuruş) and standard 2-decimal rounding. Floating-point errors (`0.1 + 0.2`) are strictly prevented.
3. **Zero is NOT Unknown:** Unknown shipping, unconfigured commission, or missing packaging is represented as `null` / `UNAVAILABLE`. It is never silently assumed to be `0.00 TL`.
4. **Authoritative Inventory Invariant:** Economics calculations are strictly read-only. `physicalStock`, `reservedStock`, and `availableStock` are never modified by economics services.
5. **No AI Guessing / Hallucination:** Commission rates and carrier costs are never invented; they stem from actual orders or explicitly configured defaults.

---

## 2. Core Architecture & Services

### `ProductEconomicsService` (`src/lib/services/product-economics.service.ts`)
Encapsulates pure calculation functions and data resolution:

* `calculateMaterialCost(weightGrams, pricePerKgTl)`: Computes filament cost deterministically.
* `classifyCostDataCompleteness(fields)`: Classifies product cost status as `COMPLETE`, `PARTIAL`, or `MISSING`.
* `calculateProductionCost(materialCost, packagingCost, otherCost)`: Computes total estimated production cost and tracks missing components.
* `calculateContribution(sellingPrice, productionCost, deductions)`: Computes estimated contribution in TL and contribution margin percentage.
* `evaluateChannelEconomics(params)`: Resolves channel-specific economics prioritizing actual order data over configured defaults.
* `getProductCostProfile(productId)` / `updateProductCostProfile(productId, input)`: Manages product cost profiles with audit logging.
* `getProductEconomics(productId)` / `getChannelComparison(productId)`: Provides side-by-side economics for ZUULAB, Trendyol, and Hepsiburada.
* `getHistoricalSalesEconomics(params)` / `getEconomicsSummary(params)`: Aggregates historical sales volume and net contribution.

---

## 3. Data Classification: Actual vs. Estimated vs. Unavailable

Every financial metric tracks its data provenance:

| Provenance | Definition | Precedence | Example |
| :--- | :--- | :---: | :--- |
| **`ACTUAL_ORDER_DATA`** | Derived directly from provider invoice or carrier webhook on an executed order. | **1 (Highest)** | Trendyol order commission of 25.00 TL |
| **`CONFIGURED`** | Established default rate entered by store admin for default forecasting. | **2** | Trendyol category commission default of 18.0% |
| **`MANUAL`** | Manually provided by administrator per batch or override. | **3** | Custom packaging override of 6.00 TL |
| **`UNAVAILABLE`** | Data not provided or configured. Represented as `null` / `—`. | **N/A** | Missing shipping cost |

---

## 4. API Endpoints

All admin endpoints enforce RBAC permissions and server-derived store context:

* `GET /api/admin/products/[id]/economics`: Retrieves complete product economics, cost profile, channel comparison, and production order history. Guarded by `PRODUCT_ECONOMICS_VIEW`.
* `PUT /api/admin/products/[id]/cost`: Updates product material usage, packaging, and misc production expenses. Guarded by `PRODUCT_ECONOMICS_MANAGE`.
* `GET /api/admin/economics/summary`: Retrieves aggregated KPI metrics for sales, production costs, and health of cost profiles. Guarded by `PRODUCT_ECONOMICS_VIEW`.
* `GET /api/admin/economics/sales`: Retrieves historical product sales performance and contribution margins. Guarded by `PRODUCT_ECONOMICS_VIEW`.
* `GET /api/admin/economics/materials` & `POST /api/admin/economics/materials`: Manages filament types (PLA, PETG, TPU, ABS, Resin) and price history. Guarded by `PRODUCT_ECONOMICS_VIEW` / `PRODUCT_ECONOMICS_MANAGE`.
* `GET /api/admin/economics/fees` & `POST /api/admin/economics/fees`: Manages sales channel commission percentages and default cargo cost estimates. Guarded by `PRODUCT_ECONOMICS_VIEW` / `PRODUCT_ECONOMICS_MANAGE`.

---

## 5. Security, RBAC & Multi-Store Isolation

### Permissions
* `PRODUCT_ECONOMICS_VIEW`: Granted to `SUPER_ADMIN`, `ADMIN`, `ORDER_MANAGER`.
* `PRODUCT_ECONOMICS_MANAGE`: Granted to `SUPER_ADMIN`, `ADMIN`.
* Staff and customers are strictly denied access.

### Multi-Store Isolation
Store identifiers (`storeId`) are derived from authenticated server context. Tenant-specific fee profiles and material overrides are partitioned by `${storeId}:${channel}` ensuring complete multi-tenant boundary integrity.
