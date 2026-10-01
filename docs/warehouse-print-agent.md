# Local Zebra Print Agent Architecture Specification

## 1. Physical vs Cloud Architecture

Next.js App Router instances (whether running serverless or in containerized clusters) cannot reliably or securely establish raw TCP socket connections to port 9100 on local thermal barcode printers sitting behind corporate warehouse NAT firewalls.

ZUULAB resolves this via an outbound HTTPS agent polling architecture:

```
+───────────────────────────+
│       ZUULAB CLOUD        │
│  (Next.js App Router API) │
+─────────────┬─────────────+
              │
              │ HTTPS GET /api/print-agent/jobs (Outbound Poll)
              │ HTTPS POST /api/print-agent/heartbeat
              ▼
+───────────────────────────+
│   LOCAL WAREHOUSE AGENT   │
│ (Lightweight Daemon/Svc)  │
+─────────────┬─────────────+
              │
              │ Local TCP Port 9100 Raw Stream
              ▼
+───────────────────────────+
│    ZEBRA PRINTER (ZPL)    │
│  (e.g., ZT411 / ZD420)    │
+───────────────────────────+
```

---

## 2. Authentication & Security

1. **Bearer Token Authentication:** Every warehouse agent registers with the cloud API via `/api/print-agent/register` using authorized administrative credentials (`WAREHOUSE_PRINTER_MANAGE`).
2. **SHA-256 Hashing:** Raw tokens are never logged or stored in plain text. The database stores the SHA-256 hash of the agent token.
3. **Heartbeat Monitoring:** Agents send heartbeats every 30 seconds. Printers with no heartbeat for > 2 minutes are marked offline automatically.
4. **Credential Isolation:** Local IP addresses and MAC addresses are stored for local subnet routing only and never exposed publicly.

---

## 3. Idempotency & Reprint Safety

* **Deduplication:** Normal print requests enforce deterministic deduplication:
  `ZEBRA_PRINT:{shipmentId}:{labelVersion}:{printerId}`
  If a job with this key has already been created, the existing job is returned without queuing duplicate physical label prints.
* **Explicit Reprints:** When a label is damaged or torn, an operator explicitly requests a reprint via the UI (`isReprint = true`). This generates a new audit-logged `WarehousePrintJob` record with `isReprint = true` and `originalJobId` linked.
* **Automatic Retry:** If an agent encounters a physical printer error (paper out, ribbon jam, socket timeout), it posts failure details back to `/api/print-agent/jobs/:id/fail`. The job increments `attempts` and applies exponential backoff up to 3 attempts before marking status `FAILED`.
