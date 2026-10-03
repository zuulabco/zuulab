import { describe, expect, it } from 'vitest'
import { formatTrMobile, normalizeTrMobile, trMobilePhone } from '@/lib/validations/phone'
import { addressSchema } from '@/lib/validations/checkout.schema'

describe('Turkish mobile numbers', () => {
  it.each([
    '05555555555',
    '0 555 555 55 55',
    '0555 555 55 55',
    '(0555) 555-55-55',
    '555 555 55 55',
    '5555555555',
    '+90 555 555 55 55',
    '+905555555555',
    '90 555 555 5555',
    '0090 555 555 55 55',
    '0555.555.55.55',
  ])('accepts %s', (input) => {
    expect(normalizeTrMobile(input)).toBe('05555555555')
  })

  it.each(['', '0212 555 55 55', '0555 555 55', '0555 555 55 555', '05a5 555 55 55', '+1 555 555 5555'])('rejects %s', (input) => {
    expect(normalizeTrMobile(input)).toBeNull()
  })

  it('formats for display', () => {
    expect(formatTrMobile('05325554433')).toBe('0532 555 44 33')
  })

  it('zod field outputs the normalized number', () => {
    expect(trMobilePhone().parse('0 532 555 44 33')).toBe('05325554433')
    expect(trMobilePhone().safeParse('123').success).toBe(false)
  })

  it('checkout address accepts spaced numbers', () => {
    const parsed = addressSchema.safeParse({
      fullName: 'Ayşe Yılmaz',
      phone: '0 532 555 44 33',
      city: 'Bolu',
      district: 'Merkez',
      postalCode: '14000',
      addressLine: 'Örnek cad. no 1 daire 2',
    })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.phone).toBe('05325554433')
  })
})
