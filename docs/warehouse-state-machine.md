# Phase 20 — Warehouse State Machines

## 1. Fulfillment State Machine (`WarehouseFulfillmentStatus`)

The physical fulfillment lifecycle is strictly forward-progressing with explicit exception handling.

```
       PENDING
          │
          ▼
    READY_TO_PICK  ───────────────┐
          │                       │
          ▼                       │
       PICKING ◄──────────┐       │
          │               │       │
          ├─────────► BLOCKED     │
          │               │       │
          ▼               ▼       ▼
       PICKED         CANCELLED CANCELLED
          │
          ▼
       PACKING ──────────► BLOCKED
          │
          ▼
       PACKED
          │
          ▼
 READY_FOR_HANDOVER
          │
          ▼
     HANDED_OVER
          │
          ▼
      COMPLETED
```

### Transition Validation Rules

| Current Status | Allowed Next Statuses | Action / Trigger |
| :--- | :--- | :--- |
| `PENDING` | `READY_TO_PICK`, `CANCELLED` | Order eligibility validated |
| `READY_TO_PICK` | `PICKING`, `CANCELLED`, `BLOCKED` | Assigned to Pick List / Scan started |
| `PICKING` | `PICKED`, `BLOCKED`, `CANCELLED` | All items scanned (`pickedQuantity == orderedQuantity`) |
| `PICKED` | `PACKING`, `CANCELLED` | Packing session initiated |
| `PACKING` | `PACKED`, `BLOCKED`, `CANCELLED` | All items packed (`packedQuantity == pickedQuantity`) |
| `PACKED` | `READY_FOR_HANDOVER`, `CANCELLED` | Shipment & Label created via ShippingService |
| `READY_FOR_HANDOVER` | `HANDED_OVER`, `CANCELLED` | Added to Cargo Manifest |
| `HANDED_OVER` | `COMPLETED` | Carrier confirms dispatch / tracking sync |
| `BLOCKED` | `READY_TO_PICK`, `PICKING`, `PACKING`, `CANCELLED` | Exception resolved by authorized manager |
| `COMPLETED` | *(Terminal)* | Physical lifecycle concluded |
| `CANCELLED` | *(Terminal)* | Order cancelled before dispatch |

---

## 2. Manifest State Machine (`ShippingManifestStatus`)

End-of-day courier handover documents adhere to a strict linear lifecycle:

```
  OPEN  ──────►  READY  ──────►  HANDED_OVER
   │
   ▼
CANCELLED
```

### Manifest Transition Rules:
- `OPEN`: Manifest created; shipments in `READY_FOR_HANDOVER` status can be attached.
- `READY`: Manifest closed; items frozen; official Zimmet Fişi PDF ready for handover signing.
- `HANDED_OVER`: Courier operator signature confirmed; attached shipments updated to `SHIPPED` via Phase 19 `ShippingService.updateShipmentStatus()`; inventory reservation committed permanently.
- `CANCELLED`: Manifest discarded before handover; attached shipments remain in `READY_FOR_HANDOVER`.
