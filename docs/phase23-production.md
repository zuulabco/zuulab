# Phase 23 — ZUULAB Business Fit & Production Management

## 1. Overview & Business Philosophy

ZUULAB is a boutique, owner-operated 3D-printing and design workshop. Rather than relying on heavyweight, multi-facility enterprise ERP features, the operational architecture must directly mirror reality:
- Single-workspace / home-studio 3D printing manufacturing.
- Sales across the direct storefront and multi-channel marketplaces (Trendyol, Hepsiburada).
- Simple, actionable production batches that feed directly into central inventory.
- Clean admin navigation organized by everyday workflow rather than corporate departments.

---

## 2. Core Architecture

### 2.1 Production Order State Machine

Production follows a deterministic lifecycle:

```
[PLANNED] ──> [QUEUED] ──> [IN_PROGRESS] ──> [COMPLETED] ──> [STOCKED] (Terminal)
    │             │              │
    └───> [CANCELLED] <──────────┴──────────> [FAILED] (Terminal)
```

- **PLANNED**: Production order drafted with target quantity, printer reference, and priority.
- **QUEUED**: Order prioritized in the manufacturing queue.
- **IN_PROGRESS**: 3D printer running the batch (`startedAt` timestamp recorded).
- **COMPLETED**: Print finished. Quality control records `completedQuantity`, `failedQuantity`, and computed `acceptedQuantity = completedQuantity - failedQuantity`.
- **STOCKED**: Goods moved to sellable stock. **Authoritatively calls `InventoryService.adjustInventory()`** with transaction type `PRODUCTION_STOCK`. Terminal state.
- **FAILED**: If entire batch failed or printer malfunction occurred. Terminal state.
- **CANCELLED**: Order cancelled before completion. Terminal state.

### 2.2 Central Inventory Invariant

ProductionService **never** mutates physical inventory directly.
Stock integration is achieved strictly through:
```typescript
await adjustInventory(order.productId, order.acceptedQuantity, {
  reason: 'Üretim Tamamlandı & Stoğa Alındı: ' + order.id,
  referenceId: order.id,
  idempotencyKey: 'PRODUCTION_STOCK:' + order.id,
  transactionType: 'PRODUCTION_STOCK',
  adminUserId: userId,
  metadata: {
    productionOrderId: order.id,
    sku: order.skuSnapshot,
    acceptedQuantity: order.acceptedQuantity,
    failedQuantity: order.failedQuantity,
  },
})
```

### 2.3 Idempotency Guarantees
- Guarded by `stockedIdempotencyKey` (`PRODUCTION_STOCK:<orderId>`).
- If `stockProductionOrder` is triggered repeatedly, it yields `{ success: true, idempotent: true }` without duplicating physical inventory.

---

## 3. Product Unit Cost & Margin Calculator

To empower the owner to assess product profitability without complex ERP systems, each product tracks lightweight cost inputs:
- `estimatedMaterialWeightGrams`: Weight of filament/resin consumed (grams).
- `materialCostPerKgTl`: Material unit cost (e.g. 600 TL/kg for standard PLA).
- `packagingCostTl`: Box, sleeve, label, and packaging cost.
- `otherProductionCostTl`: Electricity, machine wear, and miscellaneous consumables.

### Calculation Formulas:
$$\text{Material Cost (TL)} = \left(\frac{\text{weight in grams}}{1000}\right) \times \text{cost per kg}$$
$$\text{Total Production Cost (TL)} = \text{Material Cost} + \text{Packaging Cost} + \text{Other Production Cost}$$
$$\text{Gross Margin (TL)} = \text{Selling Price} - \text{Total Production Cost}$$
$$\text{Gross Margin (\%)} = \left(\frac{\text{Gross Margin (TL)}}{\text{Selling Price (TL)}}\right) \times 100$$

---

## 4. Admin UI Simplification

The admin panel was streamlined from enterprise department-oriented layouts into an owner-centric workflow:
1. **Genel**: Dashboard / Daily Overview.
2. **Siparişler**: Orders, Waiting for Prep (`PREPARING`), Shipping, Returns.
3. **Ürünler**: Product List, New Product, Categories, Collections.
4. **Stok**: Central Inventory & Transaction Ledger.
5. **Üretim**: Production Batches, New Production Order.
6. **Satış Kanalları**: Marketplace Order Pool, Marketplace Settings, SKU Mappings.
7. **Müşteriler**: Customers, Reviews, Support.
8. **Finans**: Payments, Invoices.
9. **İçerik**: Homepage CMS, Coupon Codes.
10. **Sistem**: Settings, Audit Logs, Warehouse & Advanced Fulfillment (tagged as 'İleri').

---

## 5. Security & RBAC Policies

| Role | PRODUCTION_VIEW | PRODUCTION_MANAGE | PRODUCT_COST_VIEW | PRODUCT_COST_MANAGE |
| :--- | :---: | :---: | :---: | :---: |
| **CUSTOMER** | ❌ Denied | ❌ Denied | ❌ Denied | ❌ Denied |
| **STAFF** | ✅ Allowed | ❌ Denied | ❌ Denied | ❌ Denied |
| **ORDER_MANAGER** | ✅ Allowed | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| **ADMIN** | ✅ Allowed | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| **SUPER_ADMIN** | ✅ Allowed | ✅ Allowed | ✅ Allowed | ✅ Allowed |

---

## 6. Verification & Test Suite

The system is validated by `src/scripts/verify-phase23.ts`:
- **100/100 tests passed** covering:
  - Architecture and exports (12 tests)
  - State machine valid & invalid transitions (15 tests)
  - Order creation and validations (10 tests)
  - Full production lifecycle: Start $\rightarrow$ Complete $\rightarrow$ Stock (18 tests)
  - Central inventory mutation and ledger entry validation
  - Idempotency & double-stocking prevention (3 tests)
  - Failure & cancellation workflows (8 tests)
  - Cost and profitability calculator (10 tests)
  - Low-stock detection & dashboard integration (8 tests)
  - RBAC security boundaries across roles (12 tests)
  - Admin overview integration (4 tests)

Phase 22 regression test (`src/scripts/verify-phase22.ts`) also remains at **100/100 passed**.
