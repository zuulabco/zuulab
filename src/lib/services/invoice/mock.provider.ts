import 'server-only'
import crypto from 'crypto'
import type {
  InvoiceProvider,
  CreateInvoiceRequest,
  CreateInvoiceResult,
  InvoiceStatusResult,
} from './invoice.interface'

export class MockInvoiceProvider implements InvoiceProvider {
  name: 'MOCK' = 'MOCK'
  public simulateFailure: boolean = false
  public failureMessage: string = 'Simüle edilmiş Uyumsoft entegrasyon hatası'

  async createInvoice(request: CreateInvoiceRequest): Promise<CreateInvoiceResult> {
    const now = new Date().toISOString()
    const isEInvoice =
      request.billing.type === 'CORPORATE' ||
      (request.billing.vknTckn && request.billing.vknTckn.length === 10)

    const invoiceType = isEInvoice ? 'E_FATURA' : 'E_ARSIV'

    if (this.simulateFailure) {
      return {
        success: false,
        invoiceType,
        status: 'FAILED',
        issueDate: now,
        errorCode: 'SIMULATED_FAILURE',
        errorMessage: this.failureMessage,
      }
    }

    const uuid = crypto.randomUUID()
    const numRand = Math.floor(100000000 + Math.random() * 900000000)
    const prefix = invoiceType === 'E_FATURA' ? 'ZUU' : 'EAR'
    const invoiceNumber = `${prefix}2026${numRand}`

    return {
      success: true,
      invoiceNumber,
      providerInvoiceId: uuid,
      invoiceType,
      status: 'ISSUED',
      issueDate: now,
      pdfUrl: `/api/admin/orders/${request.orderNumber}/invoice/document`,
      rawResponse: { simulated: true },
    }
  }

  async queryStatus(providerInvoiceId: string): Promise<InvoiceStatusResult> {
    return {
      status: 'ISSUED',
      providerStatus: 'Approved',
      statusCode: 100,
      message: 'Onaylandı (Mock)',
    }
  }

  async getPdf(providerInvoiceId: string): Promise<{
    success: boolean
    pdfData?: string
    pdfUrl?: string
    error?: string
  }> {
    const dummyPdf = Buffer.from('%PDF-1.4 Mock PDF Content for Zuulab Invoice').toString('base64')
    return {
      success: true,
      pdfData: dummyPdf,
    }
  }
}
