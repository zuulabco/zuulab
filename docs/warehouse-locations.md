# Warehouse Locations & Topology Specification

## 1. Domain Model & Hierarchy

The ZUULAB warehouse topology organizes physical space into a deterministic 5-tier recursive hierarchy:

```
Warehouse (e.g. MAIN)
  └── Zone (e.g. ZONE-A: Hızlı Tüketim, ZONE-B: Standart, ZONE-Q: Karantina)
       └── Aisle (e.g. Koridor 01, 02...)
            └── Rack (e.g. Raf Modülü R01, R02...)
                 └── Shelf (e.g. Kat Seviyesi S01..S05)
                      └── Bin (e.g. Kutu/Göz B01..B10)
```

Standard naming convention for pickable bins:
`{WAREHOUSE}-{ZONE}-{AISLE}-{RACK}-{SHELF}-{BIN}`  
Example: `MAIN-A-01-R01-S01-B01`

---

## 2. Invariants & Rules

1. **Non-Negative Quantities:** Every location inventory record enforces `quantity >= 0`. Any movement attempting to decrease inventory below zero is rejected with `WarehouseValidationError`.
2. **Inactive Location Guard:** No stock can be put away into or picked from a location where `isActive = false` or `isPutawayAllowed = false`. Furthermore, creating active child locations under an inactive parent is rejected.
3. **Idempotent Movements:** Every movement in `InventoryLocationMovement` records an `idempotencyKey` formatted as:
   `LOC_MOVE:{sourceLocationId}:{destinationLocationId}:{productId}:{timestamp/reference}`
   Repeated execution with the same key returns the existing record without duplicating stock.
4. **Physical Projection Independence:** `LocationInventory` represents a spatial projection of inventory. In the event that central stock diverges from location stock, a `WarehouseException` of type `LOCATION_DISCREPANCY` is logged, preserving Phase 18 inventory as the single source of truth.

---

## 3. Location Types & Designations

* `ZONE`: High-level operational zone (e.g., Fast-Pick, Bulky, Cold, Quarantine).
* `AISLE`: Physical walking aisle between storage racks.
* `RACK`: Vertical rack structure.
* `SHELF`: Horizontal shelving tier within a rack.
* `BIN`: Smallest addressable unit where items are stored and scanned.
* Special locations:
  * `RECEIVING`: Default staging dock for newly arrived inventory.
  * `PACKING_STATION`: Packing and handover assembly zones.
  * `QUARANTINE`: Isolated storage for damaged, defective, or return-inspected goods.
