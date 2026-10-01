# Phase 19 — Architecture Audit & Integration Blueprint
**ZUULAB E-Commerce Engine**
**Author:** AI Agent (Google Deepmind Antigravity)
**Date:** 2026-09-29

---

## 1. Executive Summary

Phase 19 introduces an enterprise-grade **Cargo & Shipping Integration System** designed to bridge direct storefront orders and marketplace orders (Trendyol, Hepsiburada, etc.) with physical carriers (Sürat Kargo, PTT Kargo, and Mock Carrier).

This audit inspects the current repository state across all preceding phases (Phase 6–18.1), establishes clean integration boundaries, and maps out the exact extension points to ensure zero regressions across existing storefront checkout, payment (PayTR), invoicing (Paraşüt/Uyumsoft), returns (RMA), notifications, central inventory, and marketplace synchronization.

---

## 2. Inventory of Existing Subsystems & Codebases

| Subsystem | Existing Path | Phase | Current State | Reusability / Extension Plan |
| :--- | :--- | :--- | :--- | :--- |
| **Direct Fulfillment** | `src/lib/services/shipping/fulfillment.service.ts` | Phase 9 | Active in production for direct storefront orders | **REUSE & PRESERVE**: Keep direct storefront fulfillment operational. Integrate into unified shipping abstraction without breaking backward-compat. |
| **Carrier Abstraction** | `src/lib/services/shipping/shipping.interface.ts` | Phase 9 | Basic `ShippingProvider` interface | **EXTEND**: Create comprehensive `ICargoProvider` with full lifecycle methods (`testConnection`, `createShipment`, `getShipment`, `cancelShipment`, `createLabel`, `getLabel`, `getTracking`). |
| **Provider Factory** | `src/lib/services/shipping/shipping-provider.factory.ts` | Phase 9 | Resolves MOCK, YURTICI, SURAT | **EXTEND**: Upgrade to database/configuration-driven `CargoProviderFactory` supporting Sürat, PTT, and Mock with credential isolation. |
| **Direct Shipping Models** | `prisma/schema.prisma` (`Shipment`, `ShipmentEvent`) | Phase 9 | PostgreSQL `shipments` table keyed to `Order` | **EXTEND / COMPLEMENT**: Add dedicated `ShippingShipment`, `ShippingLabel`, `ShippingEvent`, `ShippingWebhookEvent`, `ShippingQueue` domain entities supporting both Direct and Marketplace orders. |
| **Central Inventory** | `src/lib/services/inventory.service.ts` | Phase 18 | Central stock, reservations, ledger, concurrency mutex | **REUSE (STRICT INVARIANT)**: Label creation must NEVER decrement physical stock. Stock commit occurs only on `SHIPPED` via `commitInventoryReservation`. |
| **Marketplace Hub** | `src/lib/services/marketplace/` | Phase 16/17 | Ingestion, reconciliation, store credentials, order snapshots | **INTEGRATE**: Ingested orders enter shipment flow only when `MATCHED`. Block `UNMATCHED` / `PARTIALLY_MATCHED`. Update marketplace tracking on carrier dispatch. |
| **Distributed Locks** | `src/lib/services/cron/cron-lock.service.ts` | Phase 13 | `acquireCronLock` using `Setting` table / memory fallback | **REUSE**: Lock key patterns `shipping-sync-{provider}`, `shipment-label-{shipmentId}`, `tracking-sync-{shipmentId}`. |
| **Audit Logging** | `src/lib/services/admin.service.ts` | Phase 7/8 | `logAuditEvent` with DB / memory fallback | **REUSE**: Emit `shipping.shipment.*`, `shipping.label.*`, `shipping.webhook.*` events with redacted secrets. |
| **RBAC** | `src/lib/services/permissions.service.ts` | Phase 7/18 | Role-based permission checks | **EXTEND**: Add `SHIPPING_VIEW`, `SHIPPING_MANAGE`, `SHIPPING_LABEL`, `SHIPPING_CANCEL` to `AdminPermissionName`. |
| **Notifications** | `src/lib/services/notification/notification.service.ts` | Phase 10 | Customer & admin notifications | **REUSE**: Dispatch shipment status update notifications. |
| **Returns / RMA** | `src/lib/services/returns/` | Phase 11 | Return inspection, reverse logistics | **REUSE**: Emit return events without blind auto-restocking. |

---

## 3. What Phase 9 Already Provides

Phase 9 established the initial fulfillment framework:
1. `ShipmentStatus` enum (`PENDING`, `PICKED_UP`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`, `DELIVERED`, `FAILED`, `RETURNED`).
2. `fulfillment.service.ts` handling `createShipmentForOrder`, `getTrackingInfo`, `getShipmentLabel`, `cancelShipmentForOrder`.
3. In-flight concurrency lock guaranteeing One Order -> One Active Shipment.
4. Basic `SuratShippingProvider`, `YurticiShippingProvider`, and `MockShippingProvider`.
5. Basic carrier settings (`outboundCarrier`, `returnCarrier`).

### Identified Gaps in Phase 9 for Enterprise Cargo Operations:
* No first-class support for **Marketplace Orders** (only direct `Order` models supported).
* No **Label Versioning** (historical labels overwritten or lost; only single `labelData` field).
* No exact **100mm × 100mm PDF** rendering engine or thermal **ZPL** printer format.
* No barcode generator (CODE128) implementation.
* No durable **Shipping Queue** with exponential backoff and jitter for carrier API rate limits / timeouts.
* Carrier selection was limited to a static setting without business routing rules (e.g., PayTR vs COD vs Marketplace priority).
* Carrier webhook lacked strict replay protection, timestamp validation, and structured idempotency persistence.
* Lack of PTT Kargo provider implementation.

---

## 4. What Can Be Reused vs What Must Be Extended

### A. Reusable Subsystems (No breaking modifications):
- `calculateShipping` storefront rate calculator (`src/lib/services/shipping.service.ts`).
- `fulfillment.service.ts` direct storefront order fulfillment methods to ensure Phase 9 unit tests pass unchanged.
- `inventory.service.ts` reservation, release, and commit APIs.
- `acquireCronLock` distributed lock mechanics.
- `logAuditEvent` audit logging system.
- Notification dispatch service.
- Return / RMA workflow.

### B. New & Extended Subsystems:
1. **Universal Cargo Interface (`ICargoProvider`)**:
   - `testConnection(): Promise<ConnectionTestResult>`
   - `createShipment(request: CreateShipmentRequest): Promise<CreateShipmentResult>`
   - `getShipment(trackingNumber: string): Promise<ShipmentStatusResult>`
   - `cancelShipment(shipmentId: string): Promise<CancelShipmentResult>`
   - `createLabel(request: CreateLabelRequest): Promise<ShippingLabelResult>`
   - `getLabel(labelId: string): Promise<ShippingLabelResult>`
   - `getTracking(trackingNumber: string): Promise<ShipmentTrackingResult>`
2. **Provider Implementations**:
   - `MockCargoProvider`: deterministic test harness simulating all error states (rate limit, timeout, auth failure, duplicate, invalid address).
   - `SuratCargoProvider`: official Sürat Kargo web service contract (Gonderi Kayıt, Barkod, Takip, İptal).
   - `PttCargoProvider`: official PTT Kargo web service contract (Kabul, Barkod, Takip, İptal).
3. **Carrier Routing Engine (`ShippingRoutingService`)**:
   - Deterministic rule evaluation: PayTR direct orders -> Sürat Kargo; COD -> PTT Kargo; Marketplace-specified carrier prioritization.
4. **Label Generation Engine (`LabelRenderer`)**:
   - Native 100mm × 100mm PDF generation.
   - ZPL (Zebra Programming Language) for thermal printers.
   - Raster outputs (PNG/JPG data).
   - Barcode generator using Code 128.
   - Multi-version label preservation (v1, v2, v3) with checksum and storage metadata.
   - Multi-shipment combined PDF (100mm × 100mm per page).
5. **Shipping Queue & Retries**:
   - Durable queue supporting job types: `CREATE_SHIPMENT`, `CREATE_LABEL`, `POLL_LABEL`, `UPDATE_TRACKING`, `UPDATE_MARKETPLACE`, `CANCEL_SHIPMENT`.
   - Exponential backoff + jitter, max retry enforcement.
6. **Unified Webhook Handler**:
   - Route `/api/shipping/webhooks/[provider]`.
   - Signature verification, replay defense, event deduplication, safe unknown status handling.
7. **Admin Shipping Hub**:
   - Dashboard at `/admin/shipping` with 8 status counters, rich filtering, carrier settings, and bulk operations.
   - Detail view at `/admin/shipping/[id]` with full timeline, labels, and diagnostics.

---

## 5. Architectural Invariants & Safety Guarantees

1. **State Machine Invariant**:
   Transitions follow the strict DAG:
   `PENDING` -> `READY_TO_SHIP` -> `SHIPMENT_CREATING` -> `SHIPMENT_CREATED` -> `LABEL_REQUESTED` -> `LABEL_READY` -> `SHIPPED` -> `IN_TRANSIT` -> `OUT_FOR_DELIVERY` -> `DELIVERED`.
   Terminal/exceptional states: `CANCELLED`, `RETURNED`, `FAILED`.
   Invalid jumps (e.g. `PENDING` -> `DELIVERED`) are strictly rejected.
2. **Stock Mutation Isolation**:
   Label generation **never** alters physical or reserved stock.
   Physical inventory is committed **only** when shipment transitions to `SHIPPED` (or order confirmation).
3. **Marketplace Reconciliation Invariant**:
   Orders with status `UNMATCHED` or `PARTIALLY_MATCHED` cannot enter shipment creation. Only `MATCHED` orders are permitted.
4. **Deduplication & Idempotency Invariant**:
   Shipment creation, label generation, queue tasks, and webhook events are uniquely indexed and idempotent. Repeating an identical request produces an identical result without creating secondary records.
5. **PII & Credential Redaction**:
   No credentials, authorization tokens, or sensitive headers are written to audit logs, webhook event tables, or client payloads.
