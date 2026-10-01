import 'server-only'
import type { PaymentProvider, PaymentProviderName } from './payment.interface'
import { PayTRPaymentProvider } from './paytr.provider'
import { IyzicoPaymentProvider } from './iyzico.provider'
import { SandboxPaymentProvider } from './sandbox.provider'

let paytrInstance: PayTRPaymentProvider | null = null
let iyzicoInstance: IyzicoPaymentProvider | null = null
let sandboxInstance: SandboxPaymentProvider | null = null

/**
 * Returns the configured payment gateway provider.
 * Priority:
 * 1. Explicit override passed to getPaymentProvider(name)
 * 2. process.env.PAYMENT_PROVIDER ('PAYTR', 'IYZICO', or 'SANDBOX')
 * 3. Default to PayTR with built-in test simulation fallback
 */
export function getPaymentProvider(providerName?: PaymentProviderName): PaymentProvider {
  const activeName = (
    providerName ||
    process.env.PAYMENT_PROVIDER ||
    'PAYTR'
  ).toUpperCase() as PaymentProviderName

  switch (activeName) {
    case 'IYZICO':
      if (!iyzicoInstance) {
        iyzicoInstance = new IyzicoPaymentProvider()
      }
      return iyzicoInstance

    case 'SANDBOX':
      if (!sandboxInstance) {
        sandboxInstance = new SandboxPaymentProvider()
      }
      return sandboxInstance

    case 'PAYTR':
    default:
      if (!paytrInstance) {
        paytrInstance = new PayTRPaymentProvider()
      }
      return paytrInstance
  }
}
