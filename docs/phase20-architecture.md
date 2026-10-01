# Phase 20 — Warehouse Operations & Multi-Channel Fulfillment Hub Architecture

## 1. Overview & Architectural Boundaries

Phase 20 introduces a physical warehouse execution layer atop the existing Order, Inventory (Phase 18), and Shipping (Phase 19) domains without altering the authoritative boundary of inventory truth.

```
+-------------------------------------------------------------------------+
|                          ORDER INGESTION LAYER                          |
|   Direct Storefront Orders     Trendyol (MATCHED)   Hepsiburada (MATCHED) |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                  CENTRAL INVENTORY SERVICE (Phase 18)                   |
|   - Holds authoritative physicalStock & reservedStock                   |
|   - Direct/Marketplace orders reserve stock                             |
|   - NO DIRECT INVENTORY MUTATIONS in Warehouse code                     |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                 WAREHOUSE FULFILLMENT DOMAIN (Phase 20)                 |
|   WarehouseService -> PickingService -> PackingService -> ManifestService|
|   - Barcode scanning & identity resolution                              |
|   - Single & Bulk Pick Lists                                            |
|   - Packing Verification & Packing Slips                                |
|   - End-of-Day Cargo Manifest (Zimmet Fisi)                             |
|   - Warehouse Exceptions                                                |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                      SHIPPING SERVICE (Phase 19)                        |
|   - ShippingShipment & ShippingLabel (100x100mm ZPL/PDF)                |
|   - Carrier Handover transitions status to SHIPPED                      |
|   - Physical Inventory committed ONLY upon SHIPPED transition           |
+-------------------------------------------------------------------------+
```

### Core Invariants:
1. **Centralized Inventory Truth**: The warehouse layer does NOT decrement physical stock during picking, packing, or manifest creation. Stock deduction occurs solely when `ShippingService.updateShipmentStatus()` sets status to `SHIPPED`, which triggers `InventoryService.commitReservation()`.
2. **Channel & Store Isolation**: Multi-store marketplace orders (`store-ty-1`, `store-ty-2`, `store-hb-1`, `store-hb-2`) maintain strict partition boundaries. Fulfillments and manifest records preserve `storeId` and `channel`.
3. **Reconciliation Gate**: Marketplace orders in `UNMATCHED` or `PARTIALLY_MATCHED` status are rejected at fulfillment creation. Only `MATCHED` orders enter warehouse workflows.
4. **Idempotency Everywhere**: All scans, pick list creation, packing actions, and handovers accept and enforce unique idempotency keys (`WAREHOUSE_SCAN:...`).

---

## 2. Domain Entities & Database Schema

The following models were introduced to Prisma schema:

- `WarehouseFulfillment`: Root fulfillment entity tracking lifecycle status (`PENDING` through `COMPLETED`).
- `WarehouseFulfillmentItem`: Track requested, picked, and packed quantities per product/SKU.
- `WarehousePickList`: Groups single or bulk order items for warehouse floor picking.
- `WarehousePickListItem`: Item allocation linking a pick list entry back to specific fulfillment items.
- `WarehouseScanEvent`: Immutable audit log of every barcode scan attempt.
- `WarehousePackingSession`: Tracks dimensions, weights, and packaging operator metrics.
- `ShippingManifest`: End-of-day courier handover document ("Zimmet Fişi") for Sürat, PTT, or Mock carrier.
- `ShippingManifestItem`: Many-to-one junction between manifest and shipments.
- `WarehouseException`: Controlled exception log for short picks, damaged goods, or mismatch errors.

---

## 3. SLA & Prioritization Algorithm

Fulfillment queue sorting is deterministic:
1. **Promised Shipping Date / Marketplace SLA**: Earlier delivery deadline takes top priority.
2. **Order Creation Timestamp**: FIFO ordering for orders with equal SLA deadlines.
3. **Explicit Priority Field**: Manual operator elevation (1 = Highest, 100 = Normal).
4. **Channel Weight**: Marketplace SLA orders (default weight 90) given priority over standard direct orders (default weight 100) to protect marketplace seller ratings.
