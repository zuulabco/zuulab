import { describe, expect, it } from 'vitest'
import { checkoutInitiateSchema } from '@/lib/validations/checkout.schema'

const base = {
  email: 'a@example.com',
  shippingAddress: {
    fullName: 'Test Müşteri',
    phone: '05551112233',
    city: 'İstanbul',
    district: 'Kadıköy',
    postalCode: '34000',
    addressLine: 'Test Mahallesi Deneme Sokak No 1',
  },
  items: [{ productId: 'p1', quantity: 1 }],
}

describe('checkout marketing context', () => {
  it('is optional', () => {
    const r = checkoutInitiateSchema.safeParse(base)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.marketing).toBeUndefined()
  })

  it('accepts consent, visitor id and campaign parameters', () => {
    const r = checkoutInitiateSchema.safeParse({
      ...base,
      marketing: { consent: 'all', anonymousId: 'abc', attribution: { last: { utmSource: 'facebook', fbclid: 'x' }, first: {} } },
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.marketing?.attribution?.last?.utmSource).toBe('facebook')
  })

  it('never fails the checkout: a malformed block is dropped', () => {
    for (const bad of [{ consent: 'maybe' }, { anonymousId: 'x'.repeat(500) }, 'junk', 42, { attribution: { last: { utmSource: 'x'.repeat(500) } } }]) {
      const r = checkoutInitiateSchema.safeParse({ ...base, marketing: bad })
      expect(r.success).toBe(true)
      if (r.success) expect(r.data.marketing).toBeUndefined()
    }
  })
})
