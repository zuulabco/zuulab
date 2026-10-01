import type {
  EmailProvider,
  EmailSendOptions,
  EmailSendResult,
} from './notification.interface'

export class MockEmailProvider implements EmailProvider {
  public readonly providerName = 'MOCK_EMAIL'

  private static sentEmails: Array<EmailSendOptions & { sentAt: string; messageId: string }> = []
  private static shouldSimulateFailure = false

  async sendEmail(options: EmailSendOptions): Promise<EmailSendResult> {
    if (MockEmailProvider.shouldSimulateFailure) {
      return {
        success: false,
        error: 'MOCK_SIMULATED_FAILURE: E-posta sağlayıcısı geçici olarak yanıt vermedi.',
      }
    }

    const messageId = `mock_msg_${Date.now()}_${Math.floor(Math.random() * 10000)}`
    MockEmailProvider.sentEmails.push({
      ...options,
      sentAt: new Date().toISOString(),
      messageId,
    })

    return {
      success: true,
      providerMessageId: messageId,
    }
  }

  async send(options: EmailSendOptions): Promise<EmailSendResult> {
    return this.sendEmail(options)
  }

  normalizeError(error: unknown): string {
    if (typeof error === 'string') return error
    if (error && typeof error === 'object' && 'message' in error) {
      return String((error as { message: unknown }).message)
    }
    return 'Bilinmeyen e-posta gönderim hatası'
  }

  // Test helpers
  public static getSentEmails() {
    return [...MockEmailProvider.sentEmails]
  }

  public static clearSentEmails() {
    MockEmailProvider.sentEmails = []
  }

  public static setSimulateFailure(fail: boolean) {
    MockEmailProvider.shouldSimulateFailure = fail
  }

  public setShouldFail(fail: boolean) {
    MockEmailProvider.shouldSimulateFailure = fail
  }

  public getLastSentEmail() {
    return MockEmailProvider.sentEmails[MockEmailProvider.sentEmails.length - 1] || null
  }
}
