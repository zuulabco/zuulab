import { describe, expect, it } from 'vitest'
import { allocateDiscount, orderVat, round2, vatIncluded } from '@/lib/pricing/money'
import { buildMerchantOid } from '@/lib/services/payment/paytr.provider'

describe('VAT-inclusive pricing', () => {
  it('extracts VAT from a gross price', () => {
    expect(vatIncluded(120, 20)).toBe(20)
    expect(vatIncluded(100, 20)).toBe(16.67)
    expect(vatIncluded(0, 20)).toBe(0)
  })

  it('allocates a discount exactly, with no rounding drift', () => {
    const parts = allocateDiscount([33.33, 33.33, 33.34], 10)
    expect(round2(parts.reduce((a, b) => a + b, 0))).toBe(10)
  })

  it('computes order VAT after discount and including shipping', () => {
    const vat = orderVat({
      lines: [{ lineTotal: 240, taxRate: 20 }],
      discountAmount: 24,
      shippingAmount: 60,
    })
    // (240 - 24) / 6 = 36, 60 / 6 = 10
    expect(vat).toBe(46)
  })
})

describe('PayTR merchant_oid', () => {
  it('is alphanumeric and unique per attempt', () => {
    expect(buildMerchantOid('ZUU123456789012', 1)).toBe('ZUU123456789012')
    expect(buildMerchantOid('ZUU123456789012', 2)).toBe('ZUU123456789012A2')
    expect(buildMerchantOid('ZUU-202670169520', 3)).toMatch(/^[A-Za-z0-9]+$/)
  })
})
