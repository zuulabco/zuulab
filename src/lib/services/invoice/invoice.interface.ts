export type InvoiceType = 'E_FATURA' | 'E_ARSIV'

export type InvoiceStatusName =
  | 'DRAFT'
  | 'PENDING'
  | 'SUBMITTED'
  | 'ISSUED'
  | 'FAILED'
  | 'CANCELLED'

export type InvoiceProviderName = 'UYUMSOFT' | 'MANUAL' | 'MOCK'

export interface BillingAddressInfo {
  type: 'INDIVIDUAL' | 'CORPORATE'
  fullName: string
  companyName?: string | null
  vknTckn: string
  taxOffice?: string | null
  taxNumber?: string | null
  addressLine: string
  city: string
  district: string
  neighborhood?: string | null
  postalCode: string
  country: string
  email?: string | null
  phone?: string | null
}

export interface InvoiceLineItem {
  productId: string
  name: string
  sku: string
  quantity: number
  unitPrice: number
  taxRate: number
  taxAmount: number
  lineTotal: number
}

export interface CreateInvoiceRequest {
  orderNumber: string
  orderId: string
  totalAmount: number
  subtotal: number
  taxAmount: number
  shippingAmount: number
  discountAmount: number
  currency: string
  billing: BillingAddressInfo
  items: InvoiceLineItem[]
  customerNote?: string | null
}

export interface CreateInvoiceResult {
  success: boolean
  invoiceNumber?: string
  providerInvoiceId?: string // Uyumsoft UUID
  invoiceType: InvoiceType
  status: InvoiceStatusName
  issueDate: string
  pdfUrl?: string
  pdfData?: string // base64 encoded PDF
  errorCode?: string
  errorMessage?: string
  rawResponse?: Record<string, unknown>
}

export interface InvoiceStatusResult {
  status: InvoiceStatusName
  providerStatus: string
  statusCode?: number
  message?: string
}

export interface StoredInvoice {
  id: string
  orderId: string
  orderNumber: string
  provider: InvoiceProviderName
  providerInvoiceId?: string | null
  invoiceNumber?: string | null
  invoiceType: InvoiceType
  status: InvoiceStatusName
  invoiceDate?: string | null
  pdfUrl?: string | null
  pdfData?: string | null
  totalAmount: number
  taxAmount: number
  subtotal: number
  shippingAmount: number
  discountAmount: number
  currency: string
  errorMessage?: string | null
  retryCount: number
  billingSnapshot: BillingAddressInfo
  createdAt: string
  updatedAt: string
  submittedAt?: string | null
  issuedAt?: string | null
}

export interface InvoiceProvider {
  name: InvoiceProviderName
  createInvoice(request: CreateInvoiceRequest): Promise<CreateInvoiceResult>
  queryStatus(providerInvoiceId: string): Promise<InvoiceStatusResult>
  getPdf(providerInvoiceId: string): Promise<{
    success: boolean
    pdfData?: string
    pdfUrl?: string
    error?: string
  }>
  cancelInvoice?(providerInvoiceId: string, reason: string): Promise<{
    success: boolean
    error?: string
  }>
}
