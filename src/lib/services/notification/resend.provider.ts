import type {
  EmailProvider,
  EmailSendOptions,
  EmailSendResult,
} from './notification.interface'

export class ResendEmailProvider implements EmailProvider {
  public readonly providerName = 'RESEND'
  private apiKey: string
  private defaultFrom: string

  constructor(apiKey?: string, defaultFrom?: string) {
    this.apiKey = apiKey || process.env.RESEND_API_KEY || ''
    this.defaultFrom =
      defaultFrom || process.env.RESEND_FROM_EMAIL || ''
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && (this.defaultFrom || process.env.RESEND_FROM_EMAIL))
  }

  async send(options: EmailSendOptions): Promise<EmailSendResult> {
    return this.sendEmail(options)
  }

  async sendEmail(options: EmailSendOptions): Promise<EmailSendResult> {
    const isProduction =
      process.env.NODE_ENV === 'production' ||
      process.env.EMAIL_PROVIDER === 'RESEND'

    if (!this.apiKey) {
      if (isProduction) {
        throw new Error(
          'RESEND_CONFIGURATION_ERROR: RESEND_API_KEY ortam değişkeni tanımlanmamış.'
        )
      }
      console.warn('[ResendEmailProvider] API key missing in non-production, simulating send.')
      return {
        success: true,
        providerMessageId: `sim_resend_${Date.now()}`,
      }
    }

    const fromAddress = options.from || this.defaultFrom || process.env.RESEND_FROM_EMAIL
    if (!fromAddress) {
      if (isProduction) {
        throw new Error(
          'RESEND_CONFIGURATION_ERROR: RESEND_FROM_EMAIL ortam değişkeni tanımlanmamış.'
        )
      }
    }

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: options.from || this.defaultFrom,
          to: [options.to],
          subject: options.subject,
          html: options.html,
          text: options.text,
          ...(options.replyTo ? { reply_to: options.replyTo } : {}),
          ...(options.headers ? { headers: options.headers } : {}),
        }),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        return {
          success: false,
          error: json.message || `Resend API Error (HTTP ${res.status})`,
        }
      }

      return {
        success: true,
        providerMessageId: json.id,
      }
    } catch (err: unknown) {
      return {
        success: false,
        error: this.normalizeError(err),
      }
    }
  }

  /** Resend's batch endpoint: up to 100 mails per request, one rate-limit slot instead of 100 */
  async sendBatch(items: EmailSendOptions[], idempotencyKey?: string): Promise<EmailSendResult[]> {
    const failAll = (error: string) => items.map(() => ({ success: false, error }))
    if (items.length === 0) return []
    if (items.length > 100) return failAll('Resend toplu gönderimi en fazla 100 e-posta kabul eder.')
    if (!this.apiKey) {
      if (process.env.NODE_ENV === 'production' || process.env.EMAIL_PROVIDER === 'RESEND') {
        throw new Error('RESEND_CONFIGURATION_ERROR: RESEND_API_KEY ortam değişkeni tanımlanmamış.')
      }
      return items.map((_, i) => ({ success: true, providerMessageId: `sim_resend_${Date.now()}_${i}` }))
    }
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 20000)
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body: JSON.stringify(
          items.map((o) => ({
            from: o.from || this.defaultFrom,
            to: [o.to],
            subject: o.subject,
            html: o.html,
            ...(o.text ? { text: o.text } : {}),
            ...(o.replyTo ? { reply_to: o.replyTo } : {}),
            ...(o.headers ? { headers: o.headers } : {}),
            ...(o.tags?.length ? { tags: o.tags } : {}),
          }))
        ),
        signal: controller.signal,
      })
      clearTimeout(timeout)
      const json = (await res.json().catch(() => ({}))) as { data?: Array<{ id?: string }>; message?: string }
      if (!res.ok) return failAll(json.message || `Resend API Error (HTTP ${res.status})`)
      const ids = json.data ?? []
      return items.map((_, i) =>
        ids[i]?.id ? { success: true, providerMessageId: ids[i].id } : { success: false, error: 'Resend bu e-posta için kimlik döndürmedi.' }
      )
    } catch (err: unknown) {
      return failAll(this.normalizeError(err))
    }
  }

  normalizeError(error: unknown): string {
    if (typeof error === 'string') return error
    if (error && typeof error === 'object' && 'message' in error) {
      return String((error as { message: unknown }).message)
    }
    return 'Resend e-posta servisi ile bağlantı kurulamadı.'
  }
}
