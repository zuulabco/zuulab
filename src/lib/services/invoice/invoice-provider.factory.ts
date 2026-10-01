import 'server-only'
import type { InvoiceProvider, InvoiceProviderName } from './invoice.interface'
import { UyumsoftInvoiceProvider } from './uyumsoft.provider'
import { MockInvoiceProvider } from './mock.provider'

let activeProvider: InvoiceProvider | null = null

export function getInvoiceProvider(overrideProvider?: InvoiceProvider): InvoiceProvider {
  if (overrideProvider) {
    return overrideProvider
  }

  if (activeProvider) {
    return activeProvider
  }

  const configured = (process.env.INVOICE_PROVIDER || 'UYUMSOFT').toUpperCase() as InvoiceProviderName

  if (configured === 'MOCK') {
    activeProvider = new MockInvoiceProvider()
  } else {
    activeProvider = new UyumsoftInvoiceProvider()
  }

  return activeProvider
}

export function setCustomInvoiceProvider(provider: InvoiceProvider | null) {
  activeProvider = provider
}
