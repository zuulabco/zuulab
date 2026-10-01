# Carrier Cutoff Intelligence Specification

## 1. Overview & Purpose

Carrier Cutoff Intelligence optimizes warehouse fulfillment prioritization by monitoring daily carrier branch hand-off deadlines. Instead of picking orders strictly FIFO, fulfillment waves prioritize shipments whose carrier departure deadline is rapidly approaching.

---

## 2. Timezone & Operating Calendar

* **Authoritative Timezone:** `Europe/Istanbul` (UTC+3, observing standard Turkish time year-round without daylight saving shifts).
* **Operating Days:** Configured per carrier (e.g. Monday–Saturday for Sürat, Monday–Friday for PTT).
* **Holiday Calendar:** Integrated statutory public holidays (Republic Day, Labor Day, Eid, etc.). If the target cutoff falls on a non-operating day or public holiday, calculation rolls forward automatically to the next active pickup day at the configured cutoff hour.

---

## 3. Thresholds & Alert Levels

Alert levels are calculated deterministically based on minutes remaining until cutoff:

| Alert Level | Time Remaining | Visual Styling | Operational Impact |
| :--- | :--- | :--- | :--- |
| **NORMAL** | $> 120$ minutes | Neutral Green | Standard fulfillment queue processing. |
| **APPROACHING** | $60$ to $120$ minutes | Amber / Yellow | Wave generation elevates priority by $-15$ points. |
| **CRITICAL** | $< 60$ minutes | Urgent Red / Pulsing | Wave generation elevates priority by $-35$ points; orders prioritized on picking console. |
| **PASSED** | Past cutoff time | Muted Grey | Orders roll over to next day's carrier departure. |

---

## 4. Architectural Boundaries

* **No Direct Shipment Mutation:** Carrier Cutoff Intelligence prioritizes picking and wave creation; it does **never** mutate shipment status or carrier booking records.
* **Configuration-Driven:** Cutoff times, alert thresholds, and holiday dates are managed via database configuration (`CarrierCutoffConfig`), never hardcoded in source code.
