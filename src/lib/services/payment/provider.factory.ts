import 'server-only'
import type { PaymentProvider, PaymentProviderName } from './payment.interface'
import { PayTRPaymentProvider } from './paytr.provider'
import { SandboxPaymentProvider } from './sandbox.provider'

let paytrInstance: PayTRPaymentProvider | null = null
let sandboxInstance: SandboxPaymentProvider | null = null

/**
 * Returns the payment gateway provider. PayTR is the only real gateway; SANDBOX is a
 * local-development stand-in selected via PAYMENT_PROVIDER=SANDBOX.
 */
export function getPaymentProvider(providerName?: PaymentProviderName): PaymentProvider {
  const activeName = (
    providerName ||
    process.env.PAYMENT_PROVIDER ||
    'PAYTR'
  ).toUpperCase()

  if (activeName === 'SANDBOX') {
    // The sandbox accepts unsigned callbacks, so it can never back a production build.
    if (process.env.NODE_ENV === 'production') {
      throw new Error('PAYMENT_CONFIGURATION_ERROR: SANDBOX payment provider is not allowed in production.')
    }
    if (!sandboxInstance) {
      sandboxInstance = new SandboxPaymentProvider()
    }
    return sandboxInstance
  }

  if (activeName !== 'PAYTR') {
    throw new Error(`PAYMENT_CONFIGURATION_ERROR: Unsupported PAYMENT_PROVIDER "${activeName}". Only PAYTR is supported.`)
  }

  if (!paytrInstance) {
    paytrInstance = new PayTRPaymentProvider()
  }
  return paytrInstance
}
