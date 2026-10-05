import { z } from 'zod'
import { trMobilePhone } from '@/lib/validations/phone'
import { trProvince } from '@/lib/validations/province'

export const addressSchema = z.object({
  fullName: z
    .string()
    .min(3, 'Ad ve soyad en az 3 karakter olmalıdır.')
    .max(80, 'Ad ve soyad çok uzun.'),
  phone: trMobilePhone(),
  city: trProvince(),
  district: z.string().min(2, 'İlçe girilmelidir.').max(50),
  neighborhood: z.string().max(80).optional(),
  postalCode: z
    .string()
    .regex(/^[0-9]{5}$/, 'Posta kodu 5 haneli olmalıdır.')
    .or(z.string().min(3).max(10)),
  addressLine: z
    .string()
    .min(10, 'Açık adres en az 10 karakter olmalıdır (Cadde, sokak, no, daire).')
    .max(250, 'Açık adres çok uzun.'),
  companyName: z.string().max(100).optional(),
  taxOffice: z.string().max(80).optional(),
  taxNumber: z.string().max(20).optional(),
  country: z.string().optional(),
})

export const cartItemsSchema = z
  .array(
    z.object({
      productId: z.string().min(1, 'Ürün ID zorunludur.'),
      variantId: z.string().nullable().optional(),
      quantity: z.number().int().min(1, 'Miktar en az 1 olmalıdır.').max(99, 'Miktar en fazla 99 olabilir.'),
    })
  )
  .max(50, 'Sepette en fazla 50 farklı ürün bulunabilir.')

export const shippingMethodSchema = z.enum(['STANDARD', 'EXPRESS']).default('STANDARD')

/** Body of the cart quote and coupon endpoints. */
export const cartQuoteSchema = z.object({
  items: cartItemsSchema,
  couponCode: z.string().trim().max(30).optional().nullable(),
  shippingMethod: shippingMethodSchema,
  /** Havale/EFT is priced with its discount */
  paymentMethod: z.enum(['CARD', 'BANK_TRANSFER', 'CASH_ON_DELIVERY']).optional(),
})

const utmPart = z.object({
  utmSource: z.string().max(200).optional(),
  utmMedium: z.string().max(200).optional(),
  utmCampaign: z.string().max(200).optional(),
  utmTerm: z.string().max(200).optional(),
  utmContent: z.string().max(200).optional(),
  fbclid: z.string().max(200).optional(),
  gclid: z.string().max(200).optional(),
})

/**
 * Marketing context reported by the browser. It must never fail a checkout: a malformed
 * block is dropped (.catch) and the order is placed without it.
 */
export const marketingContextSchema = z
  .object({
    consent: z.enum(['all', 'necessary']).nullable().optional(),
    anonymousId: z.string().max(64).optional(),
    attribution: z.object({ last: utmPart.optional(), first: utmPart.optional() }).optional(),
  })
  .optional()
  .catch(undefined)

export const checkoutInitiateSchema = z.object({
  email: z.string().email('Geçerli bir e-posta adresi giriniz.'),
  shippingAddress: addressSchema,
  billingSameAsShipping: z.boolean().default(true),
  billingAddress: addressSchema.optional(),
  shippingMethod: shippingMethodSchema,
  couponCode: z.string().trim().max(30).optional().nullable(),
  customerNote: z.string().max(500).optional().nullable(),
  expectedTotal: z.number().optional(),
  savedAddressId: z.string().optional(),
  // Generated once per checkout attempt by the browser; repeated submits reuse it.
  checkoutKey: z.string().min(16).max(64).regex(/^[A-Za-z0-9_-]+$/).optional(),
  items: cartItemsSchema.min(1, 'Sepetinizde en az 1 ürün bulunmalıdır.'),
  /**
   * CARD: PayTR iframe. BANK_TRANSFER: havale/EFT, confirmed by the shop when the money
   * arrives. CASH_ON_DELIVERY: kapıda ödeme, collected by PTT Kargo (Geliver).
   */
  paymentMethod: z.enum(['CARD', 'BANK_TRANSFER', 'CASH_ON_DELIVERY']).default('CARD'),
  marketing: marketingContextSchema,
  /** The optional, unticked box for campaign e-mails (ticari elektronik ileti onayı) */
  marketingEmailConsent: z.boolean().optional(),
})

export type AddressInput = z.infer<typeof addressSchema>
export type CheckoutInitiateInput = z.infer<typeof checkoutInitiateSchema>
