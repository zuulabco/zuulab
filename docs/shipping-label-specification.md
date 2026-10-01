# Shipping Label Generation Specification
**ZUULAB E-Commerce Engine — Phase 19**
**Date:** 2026-09-29

---

## 1. Physical Target & Dimensions

* **Standard Dimensions**: Exactly **100 mm × 100 mm** (Square thermal transfer / direct thermal label).
* **Page Layout (PDF)**: Single-page bounding box of 283.46 pt × 283.46 pt (72 DPI standard: `[0, 0, 283.46, 283.46]`).
* **ZPL Layout**: 203 DPI standard: 800 dots × 800 dots (or 300 DPI: 1200 dots × 1200 dots).

---

## 2. Supported Formats

1. **`PDF`**:
   - Native 1:1 vector PDF format.
   - Embeds Code 128 barcode vector / bitmap.
   - Includes header with carrier brand, order number, package count, recipient address, city, district, telephone, and sender details.
2. **`ZPL`**:
   - Standard Zebra Programming Language string (`^XA ... ^XZ`).
   - Thermal printer ready without client-side drivers.
   - Includes `^BY` barcode ratio, `^BC` Code 128 command, and text fields with proper coordinate positioning (`^FO`).
3. **`PNG`**:
   - Raster preview format encoded as Base64 data URL.
   - Suitable for immediate in-browser preview inside Admin Shipping Hub.
4. **`JPG`**:
   - Compressed raster format for lightweight archival and document attachment.

---

## 3. Barcode Rules

* **Symbology**: **CODE 128** (Subset B/C auto-switching).
* **Payload**: Carrier tracking number (or package barcode).
* **Checksum**: Modulo 103 checksum calculated deterministically.
* **Readable Text**: Clear human-readable text printed directly below the barcode bars.

---

## 4. Multi-Version Label Architecture

* Each label generation produces an immutable record:
  - `version`: 1, 2, 3...
  - `storageKey`: `labels/{shipmentId}/v{version}.{ext}`
  - `checksum`: SHA-256 hash of payload data
  - `createdAt`: ISO-8601 timestamp
* Previous versions are **never overwritten**.
* Regeneration increments the version and points `currentLabelId` on the shipment to the newest version.
* All prior versions remain downloadable and auditable.

---

## 5. Combined Multi-Label PDF

* Admin feature: **"Toplu Etiket İndir" (Download All Labels)**.
* Stitches $N$ selected shipments into a single PDF document.
* **Invariant**: Every page in the combined document remains strictly **100mm × 100mm**. It does not resize or tile labels onto an A4 page.
