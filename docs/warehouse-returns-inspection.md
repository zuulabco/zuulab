# Physical Returns Inspection Hub Specification

## 1. Domain Integration

The Physical Returns Inspection Hub bridges physical package receipt at the warehouse receiving dock with the Phase 11 RMA / Returns domain and the Phase 18 authoritative inventory service.

---

## 2. Receiving & Triage Flow

```
Package Arrives at Warehouse Dock
            │
            ▼
Scan RMA Barcode / Tracking Number / Order Number
            │
            ▼
Verify Expected Return Lines vs Physical Package Contents
            │
            ▼
Scan Exact Product Barcode (Exact Match Only)
            │
            ▼
Select Item Condition:
  ├── UNOPENED / RESELLABLE ──────► Disposition: RESTOCK
  │                                     │
  │                                     ▼
  │                                Authoritative Phase 18
  │                                InventoryService Restock
  │
  ├── DAMAGED / DEFECTIVE ────────► Disposition: QUARANTINE / SCRAP
  │                                     │
  │                                     ▼
  │                                Move to Quarantine Bin (ZONE-Q)
  │                                Create WarehouseException
  │
  └── MISSING / WRONG_ITEM ───────► Disposition: EXCEPTION
                                        │
                                        ▼
                                   Raise Discrepancy Ticket
```

---

## 3. Critical Invariants

1. **Exact-Match Scanning:** The return item must match one of the expected SKUs on the RMA. Unrecognized or substituted products are rejected with `WarehouseValidationError`.
2. **Authoritative Stock Mutator Separation:**
   * Return inspection **never** directly updates `Product.physicalStock` or `Product.reservedStock`.
   * When disposition is `RESTOCK`, the service calls:
     ```typescript
     await InventoryService.restockProductInventory({
       productId: item.productId,
       quantity: item.quantity,
       reason: `Müşteri İadesi Yeniden Stoklama - İade #${returnRecord.returnNumber}`,
       idempotencyKey: `RESTOCK_RETURN:${returnRecord.id}:${item.id}`
     })
     ```
3. **Quarantine Isolation:** Damaged goods must never re-enter sellable stock. They are recorded in `WarehouseReturnInspectionItem` with `disposition = 'QUARANTINE'`, moved to quarantine location `MAIN-Q-01-R01-S01-B01`, and logged in `WarehouseExceptionService`.
4. **Idempotency:** Re-inspecting the same line item uses `RETURN_INSPECTION:{returnId}:{itemId}:{disposition}` to prevent duplicate inventory adjustments.
