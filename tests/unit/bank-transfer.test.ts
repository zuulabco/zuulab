import { describe, expect, it } from 'vitest'
import { BANK_ACCOUNT, formatIban, SALES_TERMS } from '@/config/company'
import { generateEmailTemplate } from '@/lib/services/notification/templates/template.registry'

describe('havale / EFT', () => {
  it('has a valid IBAN (ISO 13616 mod-97 check)', () => {
    const iban = BANK_ACCOUNT.iban
    expect(iban).toMatch(/^TR\d{24}$/)
    const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55))
    expect(BigInt(digits) % BigInt(97)).toBe(BigInt(1))
  })

  it('prints the IBAN in groups of four', () => {
    expect(formatIban('TR580006400000143002320605')).toBe('TR58 0006 4000 0014 3002 3206 05')
    expect(formatIban(' TR58 0006 4000 0014 3002 3206 05 ')).toBe('TR58 0006 4000 0014 3002 3206 05')
  })

  it('mails the bank details, amount and deadline', () => {
    const mail = generateEmailTemplate('BANK_TRANSFER_AWAITING', {
      orderNumber: 'ZUU000000000001',
      customerName: 'Test Müşteri',
      totalAmount: 699,
      paymentDeadline: '6 Ekim 14:30',
    })
    expect(mail.subject).toContain('ZUU000000000001')
    for (const part of [BANK_ACCOUNT.bank, BANK_ACCOUNT.holder, 'TR58 0006 4000 0014 3002 3206 05', '₺699.00', '6 Ekim 14:30']) {
      expect(mail.html).toContain(part)
      expect(mail.text).toContain(part)
    }
  })

  it('tells the customer what happens after the payment is confirmed', () => {
    const mail = generateEmailTemplate('PAYMENT_SUCCEEDED', { orderNumber: 'ZUU1', customerName: 'A', totalAmount: 10 })
    expect(mail.text).toMatch(/hazırlanıp kargoya teslim edilecek/)
  })

  it('lists havale/EFT among the payment methods in the contracts', () => {
    expect(SALES_TERMS.paymentMethods.some((m) => m.startsWith('Havale / EFT'))).toBe(true)
  })
})
