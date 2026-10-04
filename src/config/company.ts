/**
 * The seller's identity and terms of sale: one source for the legal documents,
 * the footer, the contact and corporate pages and the structured data.
 * Change a fact here and every page that states it follows.
 *
 * Reviewed by the company's lawyer before going live; values marked "check" are
 * the ones that review should confirm.
 */
export const COMPANY = {
  brand: 'zuulab',
  /** Sole proprietorship: the trade name must contain the owner's name (TTK m.41) — check */
  tradeName: 'Emrecan Yerlikaya – zuulab',
  owner: 'Emrecan Yerlikaya',
  type: 'Şahıs işletmesi',
  founded: 2026,

  /** Registered (tax) address; printed in the contracts only, not across the site */
  address: 'Beşkavaklar Mah. Necdet Gören Cad. No:19/4, Merkez / Bolu',
  /** Where returns are sent */
  returnAddress: 'Beşkavaklar Mah. Behiye Baysal Cad. Alacaköşk Sitesi No:39 Konut:2 A Blok, Merkez / Bolu',
  city: 'Bolu',
  district: 'Merkez',

  taxOffice: 'Bolu Vergi Dairesi',
  /** For a sole proprietor this is the owner's national ID number — check whether to publish */
  taxId: '26080379140',
  showTaxId: true,
  mersis: null as string | null,
  tradeRegistry: null as string | null,
  chamber: null as string | null,
  /** E-Ticaret Bilgi Platformu (ETBİS) registration — to be added once registered */
  etbis: null as string | null,

  email: 'zuulab.co@gmail.com',
  kep: 'emrecan.yerlikaya@hs02.kep.tr',
  phoneDisplay: '0 533 425 14 95',
  phoneE164: '+905334251495',
  website: 'https://www.zuulab.com',
  instagram: 'https://instagram.com/zuu.lab',

  /** Live support; orders are taken around the clock */
  supportHours: 'Hafta içi 09:00–18:00',

  team: '1–3 kişilik ekip',
  printers: [
    { model: 'Bambu Lab A1', count: 2 },
    { model: 'Bambu Lab P1S', count: 1 },
    { model: 'Bambu Lab P2S', count: 1 },
  ],
  materials: ['PLA', 'PETG'],
} as const

/** Terms of sale stated in the contracts, the return policy and the shipping page */
export const SALES_TERMS = {
  carriers: ['Sürat Kargo', 'PTT Kargo'],
  shipsTo: 'Türkiye',
  /** Business days until an in-stock item is handed to the carrier */
  stockDispatchDays: '1–3 iş günü',
  /** Business days to produce a made-to-order / personalised item */
  madeToOrderDays: '2–5 iş günü',
  /** Legal ceiling for delivery (Mesafeli Sözleşmeler Yönetmeliği m.16) */
  maxDeliveryDays: 30,
  paymentMethods: [
    'Kredi kartı ve banka kartı (PayTR güvenli ödeme altyapısı, 3D Secure)',
    'Havale / EFT (sipariş, ödeme 48 saat içinde hesabımıza ulaştığında onaylanır)',
  ],
  invoice: 'e-Fatura / e-Arşiv fatura',

  withdrawalDays: 14,
  /** Return shipping is paid by zuulab */
  freeReturns: true,
  /** Refund deadline after the withdrawal notice (Yönetmelik m.13) */
  refundDays: 14,
  /** Asked, without limiting the consumer's statutory rights */
  damageReportDays: 7,
  /** Statutory liability for defective goods (6502 s. Kanun m.12) and minimum warranty period */
  warrantyYears: 2,
} as const

/**
 * Account for havale/EFT orders: shown on the order's payment page and in the
 * bank-details e-mail. The holder name must match the account exactly, since the
 * customer's bank checks it.
 */
export const BANK_ACCOUNT = {
  bank: 'Türkiye İş Bankası',
  holder: 'Emrecan Yerlikaya',
  iban: 'TR580006400000143002320605',
} as const

/** "TR58 0006 4000 …": the IBAN in groups of four, as banks print it */
export function formatIban(iban: string): string {
  return iban.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim()
}

/** Everyone the seller shares personal data with, for the KVKK notice */
export const DATA_PROCESSORS = [
  { name: 'PayTR Ödeme ve Elektronik Para Kuruluşu A.Ş.', purpose: 'ödemenin alınması', abroad: false },
  { name: 'Sürat Kargo ve PTT Kargo', purpose: 'siparişin teslimi', abroad: false },
  { name: 'Uyumsoft', purpose: 'e-fatura / e-arşiv faturanın düzenlenmesi', abroad: false },
  { name: 'Mali müşavir (muhasebe)', purpose: 'yasal defter ve beyanların tutulması', abroad: false },
  { name: 'Google (Firebase Authentication, Google Analytics)', purpose: 'üyelik girişi ve, izninizle, site kullanım istatistikleri', abroad: true },
  { name: 'Vercel Inc.', purpose: 'web sitesinin barındırılması', abroad: true },
  { name: 'Neon (Databricks), Frankfurt – Almanya sunucuları', purpose: 'sipariş ve hesap veritabanının barındırılması', abroad: true },
  { name: 'Resend', purpose: 'sipariş ve bilgilendirme e-postalarının gönderilmesi', abroad: true },
] as const
