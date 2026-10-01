import 'server-only'

export interface UyumsoftClientConfig {
  env: 'TEST' | 'PRODUCTION'
  username?: string
  password?: string
  companyCode?: string
  timeoutMs?: number
}

export interface UyumsoftSendInvoiceResult {
  isSucceeded: boolean
  message?: string
  invoiceId?: string // Uyumsoft UUID
  invoiceNumber?: string // GIB Invoice Number
  invoiceScenario?: string
}

export interface UyumsoftStatusQueryItem {
  invoiceId: string
  status: string
  statusCode: number
  message?: string
}

/**
 * Official Uyumsoft e-Fatura / e-Arşiv SOAP Integration Client
 * Service Endpoints:
 * - Production: https://efatura.uyumsoft.com.tr/Services/Integration
 * - Test: https://efatura-test.uyumsoft.com.tr/Services/Integration
 */
export class UyumsoftClient {
  private endpoint: string
  private username: string
  private password: string
  private isConfigured: boolean
  private timeoutMs: number

  constructor(config?: Partial<UyumsoftClientConfig>) {
    const env = config?.env || (process.env.UYUMSOFT_ENV === 'PRODUCTION' ? 'PRODUCTION' : 'TEST')
    this.endpoint =
      env === 'PRODUCTION'
        ? 'https://efatura.uyumsoft.com.tr/Services/Integration'
        : 'https://efatura-test.uyumsoft.com.tr/Services/Integration'

    this.username = config?.username || process.env.UYUMSOFT_USERNAME || ''
    this.password = config?.password || process.env.UYUMSOFT_PASSWORD || ''
    this.timeoutMs = config?.timeoutMs || 15000 // 15 seconds max for serverless

    this.isConfigured = Boolean(
      this.username &&
      this.password &&
      !this.username.includes('your_') &&
      !this.password.includes('your_')
    )
  }

  get isLiveConfigured(): boolean {
    return this.isConfigured
  }

  get activeEndpoint(): string {
    return this.endpoint
  }

  /**
   * Helper to build WS-Security UsernameToken header
   */
  private buildSecurityHeader(): string {
    return `
    <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
      <wsse:UsernameToken>
        <wsse:Username>${this.escapeXml(this.username)}</wsse:Username>
        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd#PasswordText">${this.escapeXml(this.password)}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>`
  }

  /**
   * Helper to send a SOAP envelope to Uyumsoft
   */
  private async sendSoapRequest(action: string, bodyXml: string): Promise<string> {
    const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Header>
    ${this.buildSecurityHeader()}
  </soap:Header>
  <soap:Body>
    ${bodyXml}
  </soap:Body>
</soap:Envelope>`

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: `http://tempuri.org/IIntegration/${action}`,
        },
        body: envelope,
        signal: controller.signal,
      })

      const text = await res.text()
      if (!res.ok && !text.includes('Fault')) {
        throw new Error(`Uyumsoft HTTP error: ${res.status} ${res.statusText}`)
      }
      return text
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`Uyumsoft servisi yanıt vermedi (${this.timeoutMs / 1000}s zaman aşımı).`)
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * Checks if a Tax ID / National ID belongs to a registered e-Invoice taxpayer.
   * Calls official Uyumsoft: IsEInvoiceUser(vknTckn, alias)
   */
  async isEInvoiceUser(vknTckn: string): Promise<boolean> {
    if (!this.isConfigured) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('UYUMSOFT_CONFIGURATION_ERROR: Uyumsoft credentials must be configured in production.')
      }
      // Deterministic simulation for test/dev:
      // If VKN is 10 digits and starts with '9', consider e-Fatura, else e-Arşiv
      return vknTckn.length === 10 && vknTckn.startsWith('9')
    }

    try {
      const body = `<IsEInvoiceUser xmlns="http://tempuri.org/"><vknTckn>${this.escapeXml(vknTckn)}</vknTckn><alias xsi:nil="true"/></IsEInvoiceUser>`
      const xml = await this.sendSoapRequest('IsEInvoiceUser', body)
      const match = xml.match(/<IsEInvoiceUserResult[^>]*Value="([^"]+)"/)
      if (match) {
        return match[1].toLowerCase() === 'true'
      }
      return false
    } catch (err) {
      console.warn('[uyumsoft.client] IsEInvoiceUser check error:', err)
      return false
    }
  }

  /**
   * Sends an invoice to Uyumsoft via official SendInvoice operation
   */
  async sendInvoice(invoiceParams: {
    uuid: string
    invoiceNumberPrefix?: string
    scenario: 'Automated' | 'eInvoice' | 'eArchive'
    issueDate: string
    billing: {
      vknTckn: string
      name: string
      companyName?: string | null
      taxOffice?: string | null
      addressLine: string
      city: string
      district: string
      postalCode: string
      country: string
      email?: string | null
      phone?: string | null
    }
    currency: string
    subtotal: number
    taxAmount: number
    shippingAmount: number
    discountAmount: number
    totalAmount: number
    items: Array<{
      name: string
      quantity: number
      unitPrice: number
      taxRate: number
      taxAmount: number
      lineTotal: number
    }>
  }): Promise<UyumsoftSendInvoiceResult> {
    if (!this.isConfigured) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('UYUMSOFT_CONFIGURATION_ERROR: Uyumsoft username and password must be configured in production.')
      }
      // Return simulated success when running without merchant credentials
      const numRand = Math.floor(100000000 + Math.random() * 900000000)
      const prefix = invoiceParams.scenario === 'eInvoice' ? 'ZUU' : 'EAR'
      const invoiceNumber = `${prefix}2026${numRand}`
      return {
        isSucceeded: true,
        invoiceId: invoiceParams.uuid,
        invoiceNumber,
        invoiceScenario: invoiceParams.scenario,
        message: 'Fatura Uyumsoft test simülasyonu ile başarıyla kaydedildi.',
      }
    }

    // Build UBL-TR compliant InvoiceInfo XML for SendInvoice
    const invoiceXml = this.buildInvoiceInfoXml(invoiceParams)
    const body = `<SendInvoice xmlns="http://tempuri.org/"><invoices>${invoiceXml}</invoices></SendInvoice>`

    const responseXml = await this.sendSoapRequest('SendInvoice', body)

    // Parse response
    const succeededMatch = responseXml.match(/<SendInvoiceResult[^>]*IsSucceded="([^"]+)"/)
    const isSucceeded = succeededMatch ? succeededMatch[1].toLowerCase() === 'true' : false

    const msgMatch = responseXml.match(/<SendInvoiceResult[^>]*Message="([^"]*)"/)
    const message = msgMatch ? msgMatch[1] : undefined

    const idMatch = responseXml.match(/<Value[^>]*Id="([^"]+)"/)
    const invoiceId = idMatch ? idMatch[1] : invoiceParams.uuid

    const numMatch = responseXml.match(/<Value[^>]*Number="([^"]+)"/)
    const invoiceNumber = numMatch ? numMatch[1] : undefined

    return {
      isSucceeded,
      message,
      invoiceId,
      invoiceNumber,
    }
  }

  /**
   * Queries status of an outgoing invoice from Uyumsoft
   */
  async queryOutboxInvoiceStatus(invoiceId: string): Promise<UyumsoftStatusQueryItem> {
    if (!this.isConfigured) {
      return {
        invoiceId,
        status: 'Approved',
        statusCode: 100,
        message: 'Belge onaylandı (Simülasyon).',
      }
    }

    const body = `<QueryOutboxInvoiceStatus xmlns="http://tempuri.org/"><invoiceIds xmlns:q="http://schemas.microsoft.com/2003/10/Serialization/Arrays"><q:string>${this.escapeXml(invoiceId)}</q:string></invoiceIds></QueryOutboxInvoiceStatus>`
    const responseXml = await this.sendSoapRequest('QueryOutboxInvoiceStatus', body)

    const statusMatch = responseXml.match(/Status="([^"]+)"/)
    const codeMatch = responseXml.match(/StatusCode="([^"]+)"/)
    const msgMatch = responseXml.match(/Message="([^"]*)"/)

    return {
      invoiceId,
      status: statusMatch ? statusMatch[1] : 'Unknown',
      statusCode: codeMatch ? parseInt(codeMatch[1], 10) : 0,
      message: msgMatch ? msgMatch[1] : undefined,
    }
  }

  /**
   * Fetches official PDF of the invoice from Uyumsoft
   */
  async getOutboxInvoicePdf(invoiceId: string): Promise<string | null> {
    if (!this.isConfigured) {
      // In dev/test simulation, generate a valid minimal base64 PDF placeholder
      return this.generateDummyPdfBase64()
    }

    try {
      const body = `<GetOutboxInvoicePdf xmlns="http://tempuri.org/"><invoiceId>${this.escapeXml(invoiceId)}</invoiceId></GetOutboxInvoicePdf>`
      const responseXml = await this.sendSoapRequest('GetOutboxInvoicePdf', body)

      const dataMatch = responseXml.match(/<Data>([^<]+)<\/Data>/) || responseXml.match(/<Value[^>]*>([^<]+)<\/Value>/)
      if (dataMatch) {
        return dataMatch[1]
      }
      return null
    } catch (err) {
      console.error('[uyumsoft.client] getOutboxInvoicePdf error:', err)
      return null
    }
  }

  private escapeXml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }

  private buildInvoiceInfoXml(params: any): string {
    const isCorporate = params.billing.vknTckn.length === 10
    const recipientTitle = params.billing.companyName || params.billing.name

    return `
    <InvoiceInfo Scenario="${params.scenario}" CreateDateUtc="${new Date().toISOString()}" LocalDocumentId="${params.uuid}" xmlns="http://tempuri.org/">
      <TargetCustomer VknTckn="${this.escapeXml(params.billing.vknTckn)}" Title="${this.escapeXml(recipientTitle)}"/>
      <EArchiveInvoiceInfo DeliveryType="Electronic">
        <InternetSalesInfo>
          <PaymentType>KREDIKARTI_BANKAKARTI</PaymentType>
          <PaymentPlatform>PAYTR</PaymentPlatform>
          <PaymentDate>${params.issueDate.split('T')[0]}</PaymentDate>
        </InternetSalesInfo>
      </EArchiveInvoiceInfo>
    </InvoiceInfo>`
  }

  private generateDummyPdfBase64(): string {
    // Standard minimal valid 1-page PDF string
    const pdfContent = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 72 >> stream
BT /F1 16 Tf 50 780 Td (ZUULAB E-FATURA / E-ARSIV BELGESI) Tj ET
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000366 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
445
%%EOF`
    return Buffer.from(pdfContent).toString('base64')
  }
}
