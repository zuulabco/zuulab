# Phase 20 — Barcode Scanning & Resolution Engine

## 1. Scanner-First Architecture

The warehouse picking and packing interfaces are built for physical USB and Bluetooth barcode scanners operating in keyboard-wedge mode:
- **Auto-Focus Trap**: The scanner input element maintains permanent focus.
- **Auto-Refocus on Success/Failure**: After a scan succeeds or errors, the input is immediately cleared and refocused.
- **Carriage Return (Enter) Handling**: Scanners send an `Enter` keystroke terminating the barcode payload, automatically triggering the resolution and atomic mutation pipeline.

---

## 2. Identity Resolution Hierarchy

Scans are resolved deterministically using a 3-level fallback hierarchy. Fuzzy matching is strictly forbidden.

```
       [ Scanned Barcode Input ]
                  │
                  ▼
   1. Exact Internal SKU Match? ──────► Resolved Product
                  │ No
                  ▼
   2. Exact Product Barcode Match? ───► Resolved Product
                  │ No
                  ▼
   3. Marketplace Mapping Barcode? ───► Resolved Product
                  │ No
                  ▼
   [ Throw WarehouseScanError: PRODUCT_NOT_FOUND ]
```

### Ambiguity Protection:
If multiple products match a single barcode across the product catalog, the scanner engine throws `AMBIGUOUS_BARCODE` rather than guessing.

---

## 3. Scan Idempotency & Concurrency

Every scan operation accepts an idempotency key:
```
WAREHOUSE_SCAN:{fulfillmentId}:{operatorId}:{clientRequestId}
```

- If an identical scan is retried over an unstable network, the existing `WarehouseScanEvent` record is returned without incrementing `pickedQuantity` or modifying state.
- Per-fulfillment distributed mutex locks (`warehouse:fulfillment:{id}`) prevent race conditions when multiple operators scan items simultaneously.
- Atomic conditional assertions ensure:
  - `pickedQuantity <= orderedQuantity`
  - `packedQuantity <= pickedQuantity`
