# Warehouse Putaway & Stock Placement Specification

## 1. Objective

The Putaway subsystem governs the receipt and physical placement of inventory into designated warehouse bins, guiding operators to optimal storage locations and recording every physical displacement immutably.

---

## 2. Deterministic Scoring Algorithm

To avoid operator guesswork and guarantee reproducible recommendations, location scoring follows an objective mathematical formulation:

$$\text{Score} = \text{SKU Affinity} + \text{Capacity Fit} + \text{Zone Priority} + \text{Pick Frequency} + \text{Location Priority} - \text{Travel Distance}$$

### Scoring Components:

1. **SKU Affinity (+50 points):**
   Awarded if the candidate location currently holds the identical SKU. Storing identical products together maximizes storage density and reduces picking confusion.
2. **Product Family Affinity (+25 points):**
   Awarded if the bin holds products from the same category or brand.
3. **Capacity Fit (0 to 30 points):**
   Proportional to available capacity after receiving the input quantity:
   $$\text{Fit} = \min\left(30, \left\lfloor \frac{\text{Remaining Capacity}}{\text{Total Capacity}} \times 30 \right\rfloor\right)$$
4. **Zone Priority (0 to 20 points):**
   - High velocity / Fast-Pick Zone A: +20 points
   - Standard Zone B: +10 points
   - Reserve / High-Rack Zone C: +5 points
5. **Pick Frequency Bonus (0 to 15 points):**
   Fast-moving SKUs receive an additional bonus when mapped to lower, ergonomically accessible shelves (Shelf levels S01-S02).
6. **Location Base Priority (0 to 10 points):**
   Defined by `WarehouseLocation.sortOrder`.
7. **Travel Distance Penalty (-1 to -10 points):**
   Calculated based on walking distance from inbound receiving docks to the destination aisle:
   $$\text{Penalty} = \min(10, \text{Aisle Number} \times 2)$$

---

## 3. Strict Putaway Invariants

* **Capacity Enforcement:** If `currentQuantity + incomingQuantity > capacity`, the location is rejected with `WarehouseValidationError`.
* **Active Status:** Inactive locations (`isActive = false`) or locations flagged with `isPutawayAllowed = false` are never suggested and will throw errors if targeted.
* **Idempotent Execution:** Every putaway requires a unique `referenceId`. Repeated calls with the identical `referenceId` return the existing movement record and do not double-increment stock.
* **Separation of Stock Mutation:** Central `physicalStock` is never touched by the Putaway service. Putaway only updates `LocationInventory` spatial records.
