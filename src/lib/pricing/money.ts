/**
 * Money helpers shared by cart quotes, orders, PayTR baskets and invoices so every
 * layer rounds and splits VAT identically.
 *
 * ZUULAB prices are VAT-inclusive (KDV dahil): the shelf price is what the customer
 * pays, and VAT is extracted from it, never added on top.
 */

export const DEFAULT_VAT_RATE = 20

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** VAT contained in a VAT-inclusive gross amount. */
export function vatIncluded(gross: number, ratePercent: number = DEFAULT_VAT_RATE): number {
  if (gross <= 0 || ratePercent <= 0) return 0
  return round2((gross * ratePercent) / (100 + ratePercent))
}

/**
 * Splits a discount across lines in proportion to their gross totals, assigning the
 * rounding remainder to the last line so the parts always sum to the discount exactly.
 */
export function allocateDiscount(lineTotals: number[], discount: number): number[] {
  const total = lineTotals.reduce((sum, v) => sum + v, 0)
  if (discount <= 0 || total <= 0) return lineTotals.map(() => 0)

  let allocated = 0
  return lineTotals.map((lineTotal, index) => {
    if (index === lineTotals.length - 1) return round2(discount - allocated)
    const share = round2((discount * lineTotal) / total)
    allocated = round2(allocated + share)
    return share
  })
}

/**
 * VAT for an order: each line's VAT is taken from its gross after its share of the
 * discount, plus VAT on the shipping fee.
 */
export function orderVat(params: {
  lines: Array<{ lineTotal: number; taxRate: number }>
  discountAmount: number
  shippingAmount: number
  shippingTaxRate?: number
}): number {
  const shares = allocateDiscount(params.lines.map((l) => l.lineTotal), params.discountAmount)
  const linesVat = params.lines.reduce(
    (sum, line, i) => sum + vatIncluded(line.lineTotal - shares[i], line.taxRate),
    0
  )
  return round2(linesVat + vatIncluded(params.shippingAmount, params.shippingTaxRate ?? DEFAULT_VAT_RATE))
}
