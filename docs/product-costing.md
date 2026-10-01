# ZUULAB Product Costing Specification

## 1. Cost Components for 3D Printed Products

ZUULAB calculates product manufacturing cost using three primary components:

$$\text{Estimated Production Cost} = \text{Material Cost} + \text{Packaging Cost} + \text{Other Production Cost}$$

### 1.1 Material Cost Formula
For 3D printing, filament consumption is recorded in grams, and material cost is calculated against the kilogram price of the respective material profile:

$$\text{Material Cost} = \left(\frac{\text{Material Weight (grams)}}{1000}\right) \times \text{Material Price Per Kg (TL)}$$

* **Example:**
  * Filament Price: `700 TL / kg` (Standard PLA)
  * Usage: `35 g`
  * Material Cost: `(35 / 1000) * 700 = 24.50 TL`

### 1.2 Packaging Cost
* Fixed packaging and labeling expense per product (e.g. `6.00 TL` for box, protective wrap, brand sticker).
* Can be `null` if unconfigured (never assumed to be zero unless explicitly entered as 0).

### 1.3 Other Production Cost
* Represents auxiliary expenses: electricity consumption, machine nozzle/bed wear, cleaning chemicals, hardware fasteners (magnets, bearings, screws).
* Configurable as a lump-sum operational estimate (e.g. `2.00 TL`).

---

## 2. Cost Data Completeness Classification

Products are automatically classified into three health categories based on available cost inputs:

1. **`COMPLETE` (Tam):**
   * All three components (material weight & unit price, packaging cost, other production cost) are explicitly known.
   * Total cost is presented as **"Tahmini Üretim Maliyeti"**.

2. **`PARTIAL` (Kısmi):**
   * At least one component is known, but one or more inputs are missing.
   * Total cost reflects the sum of known components and explicitly highlights missing elements (e.g. "Eksik: Paketleme maliyeti").

3. **`MISSING` (Eksik):**
   * No material or packaging inputs exist.
   * Displayed as **"Hesaplanamıyor"** / `—` rather than misleading zero amounts.

---

## 3. Material Profiles & Effective Date Price History

Material prices fluctuate over time. ZUULAB maintains versioned material profiles:

* **Supported Materials:**
  * PLA: `700.00 TL/kg`
  * PETG: `750.00 TL/kg`
  * TPU: `950.00 TL/kg`
  * ABS: `650.00 TL/kg`
  * Standart Reçine (Resin): `1,100.00 TL/kg`

* **Price History & Explainability:**
  * Every price update records `effectiveFrom`, `changedBy`, old price, and new price.
  * Historical production orders retain their historical snapshot and are not retroactively mutated by future material price adjustments.
