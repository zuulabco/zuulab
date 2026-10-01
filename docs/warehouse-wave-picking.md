# Warehouse Wave Picking & Route Optimization Specification

## 1. Concept & Eligibility Barriers

Wave Picking consolidates multiple discrete customer orders (both direct storefront and reconciled marketplace orders) into a single optimized picking run. Operators navigate the warehouse once to pick items for all orders in the wave, rather than traveling back and forth per order.

### Eligibility Guards
Orders may enter a wave **only** if all of the following conditions are met:
1. Fulfillment status is `READY_TO_PICK`.
2. Marketplace reconciliation status is `MATCHED`. Orders in `UNMATCHED` or `PARTIALLY_MATCHED` are rejected at the gate.
3. Order is not currently assigned to another active wave (`waveId == null`).
4. Order has no blocking severe `WarehouseException` (e.g., stock shortage or customer address halt).
5. Order is not cancelled or already handed over.

---

## 2. Deterministic Pick Route Optimization Algorithm

ZUULAB implements a practical warehouse traversal heuristic that avoids excessive walking without requiring external GIS or stochastic TSP solvers.

### Traversal Order:
1. **Zone Traversal:** Zones are visited in pre-configured alphabetical/flow order (e.g., `A` -> `B` -> `C`).
2. **Aisle S-Shape (Serpentine) Routing:**
   - Aisles are sorted numerically (`01` -> `02` -> `03`).
   - For odd-numbered aisles, racks are visited in ascending sequence (`R01` -> `R10`).
   - For even-numbered aisles, racks are visited in descending sequence (`R10` -> `R01`), minimizing U-turns at the end of aisles.
3. **Vertical Shelving:** Shelves are visited from bottom to top (`S01` -> `S05`) to maximize ergonomic efficiency.
4. **Deterministic Uniqueness:** Every SKU location appears in the pick list exactly once with the consolidated quantity. Each consolidation item tracks individual order allocations for downstream packing separation.

---

## 3. Wave Lifecycle State Machine

```
   [PENDING]
       │  (Operator assignment)
       ▼
   [ASSIGNED]
       │  (startWave)
       ▼
  [IN_PROGRESS] ◄───► [PAUSED]
       │  (all items scanned)
       ▼
  [COMPLETED]
       │
   (or CANCELLED at any point prior to completion)
```

### Scanner-First Picking Console
* Picking console displays Current Location, Next Location, SKU, Barcode, Required Quantity, and Picked Quantity.
* Keyboards / barcode scanners trigger `scanWaveItem` without requiring mouse interaction.
* Excess scans (`pickedQuantity > requestedQuantity`) are blocked immediately by server-side validation.
