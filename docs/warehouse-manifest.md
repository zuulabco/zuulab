# Phase 20 — End-of-Day Cargo Manifest (Zimmet Fişi) & Handover

## 1. Concept & Carrier Integration

The Cargo Manifest ("Zimmet Fişi") serves as the official chain-of-custody transfer document between ZUULAB warehouse operations and courier drivers:
- Supports Sürat Kargo, PTT Kargo, and Mock Cargo providers.
- Groups shipments currently in `READY_FOR_HANDOVER` status.
- Prevents multi-manifest duplicate assignment (a shipment may belong to only one active manifest).

---

## 2. Manifest Lifecycle

1. **Manifest Creation (`OPEN`)**:
   - Generates unique manifest number (`ZIMMET-YYYYMMDD-XXXX`).
   - Shipments added individually or by bulk scan.
2. **Manifest Closure (`READY`)**:
   - Shipment count and total package count are frozen.
   - Vector PDF generated with store details, recipient summary, tracking numbers, and handover signature blocks.
3. **Carrier Handover (`HANDED_OVER`)**:
   - Courier driver and warehouse operator physical handover confirmed.
   - Driver name and notes recorded.
   - **Critical Inventory Step**: Calls Phase 19 `ShippingService.updateShipmentStatus()` to transition each shipment to `SHIPPED`.
   - This in turn executes Phase 18 `InventoryService.commitReservation()`, permanently deducting warehouse stock and releasing reservations.
   - Handover confirmation is strictly idempotent.
