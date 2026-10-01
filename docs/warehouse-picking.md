# Phase 20 — Warehouse Picking Workflow & Pick Lists

## 1. Single & Bulk Pick Lists

The warehouse picking system supports both single-fulfillment picking and bulk pick list consolidation ("Toplu Pick Listesi"):
- **Consolidation**: When multiple eligible fulfillments are selected, the system aggregates required quantities by canonical SKU / Product ID.
  - *Example*: Order A needs 2 × SKU-001, Order B needs 3 × SKU-001. The pick list requests 5 × SKU-001.
- **Traceability Preservation**: Each pick list item maintains exact line item allocations linking back to `fulfillmentId` and `fulfillmentItemId`.

---

## 2. Floor Picking Flow

1. **Pick List Creation**: Operator selects pending fulfillments and generates a pick list.
2. **Assignment**: Pick list transitions from `PENDING` to `ASSIGNED` when an operator takes responsibility.
3. **Execution (`PICKING`)**:
   - Operator scans product barcode at shelf location.
   - System validates canonical product identity via `WarehouseScanService`.
   - Idempotency key verified: duplicate requests do not double-increment quantity.
   - `pickedQuantity` is incremented atomically under distributed lock.
   - Over-picking (`pickedQuantity > requestedQuantity`) is strictly blocked.
4. **Completion (`PICKED`)**:
   - All line items must satisfy `pickedQuantity == requestedQuantity`.
   - If an item is missing or damaged, an explicit `SHORT_PICK` exception is created, moving fulfillment to `BLOCKED`.
