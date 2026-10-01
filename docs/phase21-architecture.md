# ZUULAB Phase 21 — Fulfillment Intelligence & Warehouse Optimization Architecture

## 1. System Overview

Phase 21 builds upon the operational foundations established in Phase 20 (Fulfillment, Picking, Packing, Manifests) by introducing physical warehouse topology, intelligent stock placement (Putaway), consolidated multi-order wave picking, carrier cutoff scheduling, return package physical inspection, and local thermal printer agent infrastructure.

```
                      +---------------------------------------+
                      |       Phase 18 Central Inventory      |
                      |  (SOLE Authority for Stock Mutations)  |
                      +-------------------+-------------------+
                                          |
                        Physical Projections & Authoritative Calls
                                          |
                      +-------------------v-------------------+
                      |      Phase 21 Warehouse Systems       |
                      |                                       |
                      |  +---------------------------------+  |
                      |  | 1. Topology & Putaway Engine    |  |
                      |  +---------------------------------+  |
                      |  | 2. Wave Picking & Route Opt     |  |
                      |  +---------------------------------+  |
                      |  | 3. Carrier Cutoff Intelligence  |  |
                      |  +---------------------------------+  |
                      |  | 4. Returns Inspection Hub       |  |
                      |  +---------------------------------+  |
                      |  | 5. Zebra Print Agent Gateway    |  |
                      |  +---------------------------------+  |
                      +---------------------------------------+
```

---

## 2. Inviolable Architectural Invariants

### 2.1 Inventory Authority
* **Phase 18 `InventoryService` remains the sole authority** for `physicalStock`, `reservedStock`, and `availableStock`.
* Warehouse location quantities (`LocationInventory`), putaway records, pick operations, and return inspection records **NEVER directly mutate** central inventory columns.
* When restock occurs from returns, it executes strictly via `InventoryService.restockProductInventory(...)`.
* Physical location quantities (`LocationInventory.quantity`) form a spatial projection:
  $$\sum \text{Location Inventory} \approx \text{Physical Stock}$$
  If reconciliation discrepancies occur, a `WarehouseException` is raised rather than silently mutating central inventory.

### 2.2 Fulfillment Authority
* Phase 20 `WarehouseService`, `PickingService`, `PackingService`, and `ManifestService` remain authoritative for individual order fulfillment states.
* Waves consolidate fulfillment items across multiple orders into batched scan operations while maintaining line-item allocations to individual customer shipments.

### 2.3 Shipping Authority
* Phase 19 `ShippingService` and `LabelService` remain authoritative for carrier booking, tracking numbers, and ZPL/PDF label generation.
* Carrier cutoff intelligence provides scheduling guidance and operational urgency scoring, but does not transition shipments to `SHIPPED`.

### 2.4 Marketplace Reconciliation Barrier
* Orders with marketplace status `UNMATCHED` or `PARTIALLY_MATCHED` are strictly blocked at the fulfillment and wave entry barrier. Only `MATCHED` orders enter wave picking.

### 2.5 Strict Barcode Matching
* All scanner inputs enforce exact matching against internal SKU, canonical barcode, or approved marketplace cross-references.
* Fuzzy matching, phonetic searching, or partial substring queries are strictly forbidden.

---

## 3. Subsystem Architecture

### 3.1 Warehouse Locations & Putaway
* **Topology:** Recursive hierarchy (`ZONE` -> `AISLE` -> `RACK` -> `SHELF` -> `BIN`).
* **Scoring:** Deterministic multi-factor scoring algorithm balances SKU affinity, volumetric capacity fit, pick frequency, and physical walking distance.
* **Ledger:** Immutable `InventoryLocationMovement` records all physical stock movements with deterministic idempotency keys.

### 3.2 Wave Picking & Deterministic Route Optimization
* **Wave Batching:** Groups eligible `READY_TO_PICK` fulfillments by carrier, priority, or cutoff urgency.
* **Route Traversal:** Practical nearest-neighbor heuristic sorts zones by warehouse layout order, aisles numerically, and racks/shelves consecutively, eliminating redundant walking loops.

### 3.3 Carrier Cutoff Intelligence
* **Timezone:** Standardized on `Europe/Istanbul` (UTC+3).
* **Alert Levels:** Configurable thresholds (`NORMAL` > 120m, `APPROACHING` 60-120m, `CRITICAL` < 60m, `PASSED`).
* **Calendar:** Accounts for non-operating pickup days (e.g. Sunday) and Turkish national/religious holidays.

### 3.4 Physical Returns Inspection Hub
* **Package Triage:** Barcode-driven intake matching RMA, order number, or tracking number.
* **Item Disposition:** Structured inspection assigning condition (`UNOPENED`, `DAMAGED`, `DEFECTIVE`, etc.) and disposition (`RESTOCK`, `QUARANTINE`, `SCRAP`).
* **Quarantine Guard:** Damaged or suspect items are routed to designated quarantine bins and create warehouse exceptions; they are never returned to sellable stock.

### 3.5 Zebra Print Agent Architecture
* **Decoupled Gateway:** Avoids insecure direct TCP 9100 socket connections from Next.js serverless functions.
* **Agent Security:** Local agent authenticates over HTTPS using SHA-256 hashed registration tokens.
* **Heartbeat & Queue:** Online/offline status tracked via periodic ping; print jobs dispatched idempotently with automatic retry and reprint distinction.
