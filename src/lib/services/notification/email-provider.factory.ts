import { EmailProvider } from './notification.interface'
import { MockEmailProvider } from './mock.provider'
import { ResendEmailProvider } from './resend.provider'

let activeEmailProviderInstance: EmailProvider | null = null

export function getEmailProvider(forceProvider?: string): EmailProvider {
  const providerName = (
    forceProvider ||
    process.env.EMAIL_PROVIDER ||
    'MOCK'
  ).toUpperCase()

  if (activeEmailProviderInstance && !forceProvider) {
    return activeEmailProviderInstance
  }

  let provider: EmailProvider

  switch (providerName) {
    case 'RESEND':
      provider = new ResendEmailProvider()
      break
    case 'MOCK':
      if (process.env.NODE_ENV === 'production') {
        console.warn(
          '[SECURITY WARNING] MockEmailProvider is active in PRODUCTION environment. ' +
          'Customer transactional emails will not be sent to real recipients!'
        )
      }
      provider = new MockEmailProvider()
      break
    default:
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          `EMAIL_CONFIGURATION_ERROR: Unknown email provider '${providerName}' in production. ` +
          `Valid values: RESEND, MOCK`
        )
      }
      provider = new MockEmailProvider()
      break
  }

  if (!forceProvider) {
    activeEmailProviderInstance = provider
  }

  return provider
}

export function resetEmailProviderInstance(): void {
  activeEmailProviderInstance = null
}
