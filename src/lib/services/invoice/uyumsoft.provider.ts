import 'server-only'
import crypto from 'crypto'
import type {
  InvoiceProvider,
  CreateInvoiceRequest,
  CreateInvoiceResult,
  InvoiceStatusResult,
  InvoiceType,
  InvoiceStatusName,
} from './invoice.interface'
import { UyumsoftClient } from './uyumsoft.client'

export class UyumsoftInvoiceProvider implements InvoiceProvider {
  name: 'UYUMSOFT' = 'UYUMSOFT'
  private client: UyumsoftClient

  constructor(client?: UyumsoftClient) {
    this.client = client || new UyumsoftClient()
  }

  async createInvoice(request: CreateInvoiceRequest): Promise<CreateInvoiceResult> {
    const uuid = crypto.randomUUID()
    const now = new Date().toISOString()
    const vknTckn = request.billing.vknTckn || '11111111111'

    // Determine if customer is an e-Invoice user
    const isEInvUser = await this.client.isEInvoiceUser(vknTckn)
    const invoiceType: InvoiceType = isEInvUser ? 'E_FATURA' : 'E_ARSIV'
    const scenario = isEInvUser ? 'eInvoice' : 'eArchive'

    try {
      const sendResult = await this.client.sendInvoice({
        uuid,
        scenario,
        issueDate: now,
        billing: {
          vknTckn,
          name: request.billing.fullName,
          companyName: request.billing.companyName,
          taxOffice: request.billing.taxOffice,
          addressLine: request.billing.addressLine,
          city: request.billing.city,
          district: request.billing.district,
          postalCode: request.billing.postalCode,
          country: request.billing.country || 'TR',
          email: request.billing.email,
          phone: request.billing.phone,
        },
        currency: request.currency || 'TRY',
        subtotal: request.subtotal,
        taxAmount: request.taxAmount,
        shippingAmount: request.shippingAmount,
        discountAmount: request.discountAmount,
        totalAmount: request.totalAmount,
        items: request.items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          taxRate: i.taxRate,
          taxAmount: i.taxAmount,
          lineTotal: i.lineTotal,
        })),
      })

      if (!sendResult.isSucceeded) {
        return {
          success: false,
          invoiceType,
          status: 'FAILED',
          issueDate: now,
          errorCode: 'UYUMSOFT_SEND_ERROR',
          errorMessage: sendResult.message || 'Fatura Uyumsoft servisine iletilemedi.',
          rawResponse: { sendResult },
        }
      }

      const invoiceNumber = sendResult.invoiceNumber || `ZUU2026${Date.now().toString().slice(-9)}`
      const providerInvoiceId = sendResult.invoiceId || uuid

      return {
        success: true,
        invoiceNumber,
        providerInvoiceId,
        invoiceType,
        status: 'ISSUED',
        issueDate: now,
        pdfUrl: `/api/admin/orders/${request.orderNumber}/invoice/document`,
        rawResponse: { sendResult },
      }
    } catch (err: any) {
      console.error('[uyumsoft.provider] createInvoice exception:', err)
      return {
        success: false,
        invoiceType,
        status: 'FAILED',
        issueDate: now,
        errorCode: 'UYUMSOFT_EXCEPTION',
        errorMessage: err.message || 'Uyumsoft iletişim hatası.',
      }
    }
  }

  async queryStatus(providerInvoiceId: string): Promise<InvoiceStatusResult> {
    try {
      const res = await this.client.queryOutboxInvoiceStatus(providerInvoiceId)
      const mappedStatus = this.mapUyumsoftStatus(res.status)
      return {
        status: mappedStatus,
        providerStatus: res.status,
        statusCode: res.statusCode,
        message: res.message,
      }
    } catch (err: any) {
      return {
        status: 'FAILED',
        providerStatus: 'Error',
        message: err.message,
      }
    }
  }

  async getPdf(providerInvoiceId: string): Promise<{
    success: boolean
    pdfData?: string
    pdfUrl?: string
    error?: string
  }> {
    try {
      const pdfBase64 = await this.client.getOutboxInvoicePdf(providerInvoiceId)
      if (!pdfBase64) {
        return { success: false, error: 'Fatura belgesi Uyumsoft üzerinde henüz hazır değil.' }
      }
      return {
        success: true,
        pdfData: pdfBase64,
      }
    } catch (err: any) {
      return { success: false, error: err.message || 'PDF belgesi alınamadı.' }
    }
  }

  private mapUyumsoftStatus(status: string): InvoiceStatusName {
    switch (status) {
      case 'Approved':
        return 'ISSUED'
      case 'Queued':
      case 'Processing':
      case 'SentToGib':
        return 'SUBMITTED'
      case 'Draft':
        return 'DRAFT'
      case 'Canceled':
      case 'EArchivedCanceled':
        return 'CANCELLED'
      case 'Error':
      case 'Declined':
        return 'FAILED'
      default:
        return 'PENDING'
    }
  }
}
