# Phase 20 — Warehouse Packing & Shipping Integration

## 1. Packing Station Flow

The packing station provides a fast, keyboard-first operational interface (`/admin/warehouse/packing`):
1. **Order Lookup**: Operator scans order barcode or enters order number (`ZUUL-...` or marketplace external order ID).
2. **Packing Session Initiation**:
   - `WarehousePackingSession` record opened with operator ID.
   - Fulfillment status transitions to `PACKING`.
3. **Item Packing Verification**:
   - Operator scans each physical unit placed into the box.
   - Quantity invariant enforced: `packedQuantity <= pickedQuantity`.
   - Visual counter updates in real time with audio/status indicators.
4. **Package Dimensions & Weight**:
   - Operator records package count, gross weight (grams), and dimensional specs (length × width × height in mm).

---

## 2. Shipping Service & Label Delegation

Upon packing completion (`completePacking`):
1. **Shipping Delegation**: The warehouse layer calls Phase 19 `ShippingService.createShipment()`:
   - Does NOT use raw Prisma to insert shipment records.
   - Provider resolution (Sürat, PTT, or Mock) is handled by Phase 19 factory.
2. **Label Generation**:
   - Calls Phase 19 `ShippingLabelService.generateLabel()`.
   - Returns 100mm × 100mm thermal label (ZPL II + Vector PDF + preview image).
3. **Status Progression**:
   - Fulfillment advances to `READY_FOR_HANDOVER`.
   - Packing slip PDF generated automatically for inclusion in parcel.
