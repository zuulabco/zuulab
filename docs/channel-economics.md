# ZUULAB Sales Channel Economics

## 1. Supported Sales Channels

ZUULAB operates across three active sales channels:

1. **`ZUULAB` (Direct Website):**
   * Direct storefront (`zuulab.com`).
   * Marketplace commission: `0%`.
   * Payment Gateway Fee: `2.8% + 0.50 TL` (e.g. PayTR/Iyzico).
   * Shipping: Actual cargo cost or default carrier agreement estimate (`40.00 TL`).

2. **`TRENDYOL`:**
   * Category Commission: Configurable default percentage (typically `18.0%`).
   * Payment Processing: Included in Trendyol commission (`0.00 TL`).
   * Shipping: Anlaşmalı kargo baremi estimate (`45.00 TL`) or actual settlement deduction.

3. **`HEPSIBURADA`:**
   * Category Commission: Configurable default percentage (typically `17.0%`).
   * Payment Processing: Included in Hepsiburada commission (`0.00 TL`).
   * Shipping: Anlaşmalı kargo baremi estimate (`45.00 TL`) or actual settlement deduction.

---

## 2. Contribution Margin Formula

For any product sold on a given channel:

$$\text{Gross Revenue} - \text{Production Cost} - \text{Channel Commission} - \text{Shipping Cost} - \text{Payment Fee} - \text{Other Known Costs} = \text{Estimated Net Contribution (Tahmini Net Katkı)}$$

Contribution Margin Percentage:

$$\text{Margin Percent} = \left(\frac{\text{Estimated Net Contribution}}{\text{Gross Revenue}}\right) \times 100$$

* If Gross Revenue is `0.00 TL` or undefined: Margin percentage is undefined (`null` / `—`) to prevent division by zero.
* If required cost components are unknown: Net Contribution is labeled as **"Hesaplanamıyor"**.

---

## 3. Side-by-Side Channel Comparison Example

| Metric | ZUULAB Direct | Trendyol | Hepsiburada |
| :--- | :---: | :---: | :---: |
| **Satış Fiyatı** | 149.00 TL | 169.00 TL | 169.00 TL |
| **Üretim Maliyeti** | 32.50 TL | 32.50 TL | 32.50 TL |
| **Kanal Komisyonu** | 0.00 TL (0%) | 30.42 TL (18%) | 28.73 TL (17%) |
| **Kargo Maliyeti** | 40.00 TL | 45.00 TL | 45.00 TL |
| **Sanal Pos / Ödeme** | 4.67 TL (2.8% + 0.50) | 0.00 TL (Dahil) | 0.00 TL (Dahil) |
| **Tahmini Net Katkı** | **71.83 TL** | **61.08 TL** | **62.77 TL** |
| **Katkı Marjı** | **%48.21** | **%36.14** | **%37.14** |

---

## 4. Operational Principles
* **Neutrality:** The system displays factual calculated figures without subjectively labeling channels as "Best" or "Worst".
* **Provenance Badges:** Clear UI indicators show whether deductions represent `ACTUAL_ORDER_DATA` or `CONFIGURED` default estimates.
