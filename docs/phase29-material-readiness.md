# PHASE 29 — ZUULAB MATERIAL & CONSUMABLES READINESS

## 1. Overview & Purpose

ZUULAB is a boutique, single-operator 3D printing and e-commerce workshop. Following the operational foundations established across Phases 18 through 28 (Marketplaces, Central Inventory, Shipping, Warehouse, Production, Product Economics, Daily Workshop Planning), Phase 29 closes a critical operational gap:

> **"Which raw materials (filament types, colors, and basic packaging consumables) are required for today's production demand, and does the workshop have sufficient material in stock to fulfill this demand without blocking production?"**

This phase does **not** introduce automated procurement, ERP, supplier management, or automated consumption deductions upon production start/completion. Its strict objective is:

$$\text{Current Material Stock} \longrightarrow \text{Order-Driven Requirement} \longrightarrow \text{Surplus / Deficit Visibility \& Production Blockers}$$

---

## 2. Architecture & Data Model

### 2.1 Prisma Models & Schema

The operational material stock layer is built directly upon the existing `MaterialProfile` system (Phase 24), preserving authoritative price history and material naming conventions (`PLA`, `PETG`, `TPU`, `ABS`, `Standart Reçine`).

```prisma
enum MaterialMovementType {
  PURCHASE
  MANUAL_ADJUSTMENT
  PRODUCTION_CONSUMPTION
  WASTE
  RETURN
}

model MaterialStock {
  id                   String                  @id @default(cuid())
  storeId              String?                 @map("store_id")
  materialProfileId    String?                 @map("material_profile_id")
  materialName         String                  @map("material_name")
  color                String?                 @map("color")
  quantityGrams        Decimal                 @default(0) @db.Decimal(12, 2) @map("quantity_grams")
  minimumQuantityGrams Decimal                 @default(1000) @db.Decimal(12, 2) @map("minimum_quantity_grams")
  location             String?                 @map("location")
  isActive             Boolean                 @default(true) @map("is_active")
  createdAt            DateTime                @default(now()) @map("created_at")
  updatedAt            DateTime                @updatedAt @map("updated_at")

  movements            MaterialStockMovement[]

  @@unique([storeId, materialName, color], name: "store_material_color_unique")
  @@index([storeId])
  @@index([materialProfileId])
  @@index([materialName])
  @@index([isActive])
  @@map("material_stocks")
}

model MaterialStockMovement {
  id                    String               @id @default(cuid())
  materialStockId       String               @map("material_stock_id")
  type                  MaterialMovementType @map("type")
  quantityGrams         Decimal              @db.Decimal(12, 2) @map("quantity_grams")
  previousQuantityGrams Decimal              @db.Decimal(12, 2) @map("previous_quantity_grams")
  newQuantityGrams      Decimal              @db.Decimal(12, 2) @map("new_quantity_grams")
  reason                String               @db.Text @map("reason")
  reference             String?              @map("reference")
  idempotencyKey        String?              @unique @map("idempotency_key")
  createdBy             String               @map("created_by")
  createdAt             DateTime             @default(now()) @map("created_at")

  stock                 MaterialStock        @relation(fields: [materialStockId], references: [id], onDelete: Cascade)

  @@index([materialStockId])
  @@index([type])
  @@index([createdAt])
  @@map("material_stock_movements")
}
```

### 2.2 Quantity Invariants & Units

1. **Authoritative Units**: All quantities are stored as non-negative **grams** (`quantityGrams >= 0`). Fractional grams are supported.
2. **UI Display**: Formatted cleanly as `kg` when $\ge 1000\text{g}$ (e.g. `2.5 kg`) or `g` when $< 1000\text{g}$ (e.g. `650 g`), while maintaining exact grams in backend state.
3. **Non-Negative Guard**: Any manual adjustment or deduction that would cause `quantityGrams < 0` is strictly rejected with HTTP 422.

---

## 3. Movement Ledger & Idempotency

### 3.1 Material Movements
Material quantities are never altered randomly. Every change records an immutable `MaterialStockMovement` with:
- `type`: `PURCHASE` | `MANUAL_ADJUSTMENT` | `PRODUCTION_CONSUMPTION` | `WASTE` | `RETURN`
- `previousQuantityGrams`, `newQuantityGrams`, and `quantityGrams` (delta)
- `reason`: Mandatory audit reason
- `reference`: Optional document or invoice number
- `idempotencyKey`: Unique client/operation key
- `createdBy`: User identifier

### 3.2 Idempotent Adjustments
When an `idempotencyKey` is provided (e.g., rapid duplicate button clicks or network retries):
- The service inspects existing movements for that stock.
- If a movement with the same key already exists, the adjustment is **not** reapplied, returning `isIdempotentRepeat: true` with the current stock state.

---

## 4. Multi-Store Isolation

- Material stocks and movements are strictly scoped by `storeId`.
- The client-supplied `storeId` is never trusted; requests obtain `user.storeId` from verified server-side authentication context (`requireAuth` / `requirePermission`).
- `store-hb-1` inventory is completely invisible and inaccessible to `store-ty-1` operators (returning 404 / 403 on cross-tenant access).

---

## 5. Requirement & Readiness Calculation

### 5.1 Order-Driven Demand
Material requirements are computed directly from Phase 28's authoritative `DailyOperationsService.getProductionRecommendations(storeId)`:
- Only items with `requiredProduction > 0` require new filament.
- This prevents double-counting orders whose demand is already met by available or reserved warehouse inventory.

### 5.2 Deterministic Formula & Multi-Product Aggregation

$$\text{requiredMaterialGrams} = \text{productionQuantity} \times \text{productMaterialGrams}$$

When multiple products share the same material and color:
$$\text{Total Required} = \sum (\text{productionQuantity}_i \times \text{productMaterialGrams}_i)$$

*Example*:
- Product A: $5 \times 120\text{g PLA} = 600\text{g}$
- Product B: $2 \times 150\text{g PLA} = 300\text{g}$
- **Aggregated Requirement**: $900\text{g PLA}$

### 5.3 Exact Material & Color Matching
- Filaments are tracked per material and color (e.g., `PLA — Black`, `PLA — White`).
- If a product specifies a color (`PLA Black`), it **only** matches `PLA Black` stock. `PLA White` stock is never substituted.
- If a product specifies no color, it draws from the general pool (`color === null`) or total material availability.

### 5.4 Readiness Status Rules

| Status | Condition | Description |
| :--- | :--- | :--- |
| `READY` | $\text{Available} \ge \text{Required}$ and $\text{Remaining} \ge \text{Minimum}$ | Ample material in stock for today's production. |
| `LOW` | $\text{Available} \ge \text{Required}$, but $\text{Remaining} < \text{Minimum}$ | Sufficient for today, but remaining stock breaches safety threshold. |
| `BLOCKED` | $\text{Available} < \text{Required}$ | Insufficient stock. $\text{Missing} = \text{Required} - \text{Available}$. |
| `UNKNOWN` | Missing material type or weight data | Data incomplete; never coerced to zero. |

---

## 6. Daily Workshop & Production Integration

### 6.1 Today Operational Hub (`/admin/today`)
1. **Malzeme Durumu KPI**: Shows production demand count, producible count, and blocked count with quick link to `/admin/materials`.
2. **Malzeme Blokerleri Section**: Displays all products blocked due to filament deficits, specifying required vs available vs missing grams with action button `[Malzemeyi Gör]`.

### 6.2 Production Queue (`/admin/production`)
- Each active and queued production batch displays a live material readiness badge:
  - `✓ Malzeme: Hazır` (Green)
  - `⚠ Malzeme: 350g eksik (PLA Black)` (Red)
- **Non-blocking Rule**: The operator is warned, but production start is not artificially blocked.

---

## 7. Economics & Operational Value Integration

- Integrates with Phase 24 `MaterialProfile` pricing (`getMaterialByName`):
  $$\text{Current Material Value (TL)} = \left(\frac{\text{quantityGrams}}{1000}\right) \times \text{pricePerKgTl}$$
- **Zero Automatic Cost Mutation**: Adjusting material stock quantity does **not** mutate product catalog economics, unit costs, or price history.

---

## 8. API Surface

| Method | Endpoint | Permission | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/materials` | `MATERIAL_VIEW` | Lists material stocks for store context. |
| `POST` | `/api/admin/materials` | `MATERIAL_MANAGE` | Creates a new material stock item. |
| `GET` | `/api/admin/materials/[id]` | `MATERIAL_VIEW` | Fetches material stock details with economics. |
| `PUT` | `/api/admin/materials/[id]` | `MATERIAL_MANAGE` | Updates material metadata (color, min stock, location). |
| `POST` | `/api/admin/materials/[id]/adjust` | `MATERIAL_MANAGE` | Idempotently adjusts stock (+ / - grams). |
| `GET` | `/api/admin/materials/[id]/movements` | `MATERIAL_VIEW` | Fetches movement audit history. |
| `GET` | `/api/admin/materials/readiness` | `MATERIAL_VIEW` | Returns readiness overview, summary KPIs, and blockers. |

---

## 9. RBAC & Security Boundaries

- `SUPER_ADMIN` & `ADMIN`: `MATERIAL_VIEW`, `MATERIAL_MANAGE` (Full management & adjustment privileges).
- `STAFF` & `ORDER_MANAGER`: `MATERIAL_VIEW` (Read-only operational visibility).
- `CUSTOMER`: Blocked with HTTP 403 Forbidden.

---

## 10. Verification & Test Suite

Comprehensive automated test suite located at `src/scripts/verify-phase29.ts` covering 28 test groups:
- **T1**: Material list authenticated access
- **T2**: CUSTOMER blocked (403) & Unauthenticated (401)
- **T3**: Multi-store tenant isolation
- **T4**: Material stock creation
- **T5**: Non-negative quantity invariant enforcement
- **T6**: Manual adjustment positive increase
- **T7**: Manual adjustment negative decrease
- **T8**: Adjustment idempotency protection
- **T9**: Movement history creation & audit fields
- **T10**: Audit log emission
- **T11**: Deterministic material requirement calculation
- **T12**: Multi-product same-material aggregation
- **T13**: Exact color matching (no fuzzy substitution)
- **T14**: Readiness status `READY`
- **T15**: Readiness status `LOW`
- **T16**: Readiness status `BLOCKED`
- **T17**: `UNKNOWN` status preservation (not zero)
- **T18**: Production blocker detection
- **T19**: `/admin/today` material integration
- **T20**: `/admin/production` readiness badge integration
- **T21**: Non-mutation of material stock on read queries
- **T22**: Non-mutation of product inventory (`InventoryService`)
- **T23**: Non-mutation of order inventory
- **T24**: Non-mutation of production inventory
- **T25**: Operational economics valuation via `MaterialProfile`
- **T26**: RBAC permission boundaries
- **T27**: TypeScript 0 errors check
- **T28**: Production build verification

---

## 11. Scope Limitations & Future Boundaries

- **No Auto-Deduction**: Phase 29 does not automatically mutate material stocks when production orders start or complete.
- **No Procurement/ERP**: No purchase orders, supplier APIs, or AI forecasting.
- **Finished Goods Stock Distinction**: Material stock (grams) and finished goods stock (units) remain strictly decoupled domain authorities.
