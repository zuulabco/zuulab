import { ShippingProvider } from './shipping.interface'
import { MockShippingProvider } from './mock.provider'
import { YurticiShippingProvider } from './yurtici.provider'
import { SuratShippingProvider } from './surat.provider'
import { GeliverShippingProvider } from './geliver/geliver.provider'
import { getCarrierSettings, getCarrierSettingsSync } from './shipping-settings.service'

/**
 * Instantiates a shipping provider by key.
 * Explicit production safety: if a real provider is selected but credentials
 * are missing, the provider itself throws PROVIDER_CONFIGURATION_ERROR,
 * never silently falling back to MOCK.
 */
function instantiateProvider(carrierKey: string): ShippingProvider {
  const normalized = carrierKey.trim().toUpperCase()

  switch (normalized) {
    case 'SURAT':
    case 'SURAT_KARGO':
      return new SuratShippingProvider()
    case 'YURTICI':
    case 'YURTICI_KARGO':
      return new YurticiShippingProvider()
    // Kapıda ödeme (PTT Kargo) through Geliver
    case 'GELIVER':
      return new GeliverShippingProvider()
    case 'MOCK':
    case 'MOCK_CARGO':
      if (process.env.NODE_ENV === 'production') {
        console.warn(
          '[SECURITY WARNING] MockShippingProvider is active in PRODUCTION environment. ' +
          'Simulated logistics should not be used for live customer orders!'
        )
      }
      return new MockShippingProvider()
    default:
      // Unknown provider key — fail loudly in production, fallback in dev
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          `SHIPPING_CONFIGURATION_ERROR: Unknown provider key '${normalized}'. ` +
          `Valid values: SURAT, YURTICI, GELIVER, MOCK`
        )
      }
      console.warn(`[ShippingProviderFactory] Unknown key '${normalized}', using Mock in dev mode.`)
      return new MockShippingProvider()
  }
}

/**
 * Factory class for resolving outbound and return shipping providers.
 */
export class ShippingProviderFactory {
  static getProvider(carrierKey: string): ShippingProvider {
    return instantiateProvider(carrierKey)
  }

  static async getOutboundProvider(forceProvider?: string): Promise<ShippingProvider> {
    if (forceProvider) return instantiateProvider(forceProvider)
    const settings = await getCarrierSettings()
    return instantiateProvider(settings.outboundCarrier)
  }

  static getOutboundProviderSync(forceProvider?: string): ShippingProvider {
    return getShippingProvider(forceProvider)
  }

  static async getReturnProvider(forceProvider?: string): Promise<ShippingProvider> {
    if (forceProvider) return instantiateProvider(forceProvider)
    const settings = await getCarrierSettings()
    return instantiateProvider(settings.returnCarrier)
  }

  static getReturnProviderSync(forceProvider?: string): ShippingProvider {
    return getReturnShippingProvider(forceProvider)
  }
}

/**
 * Resolves the active provider for outbound customer shipments.
 * Priority: forceProvider arg > DB setting > OUTBOUND_SHIPPING_PROVIDER env > SHIPPING_PROVIDER env > MOCK
 */
export function getShippingProvider(forceProvider?: string): ShippingProvider {
  if (forceProvider) return instantiateProvider(forceProvider)

  const settings = getCarrierSettingsSync()
  const providerName =
    settings.outboundCarrier ||
    process.env.OUTBOUND_SHIPPING_PROVIDER ||
    process.env.SHIPPING_PROVIDER ||
    'MOCK'

  return instantiateProvider(providerName)
}

/**
 * Resolves the active provider for reverse logistics / return shipments.
 * Priority: forceProvider arg > DB setting > RETURN_SHIPPING_PROVIDER env > SHIPPING_PROVIDER env > MOCK
 *
 * Return carrier is intentionally independent of outbound carrier.
 * Example: outbound=SURAT, return=YURTICI is fully supported.
 */
export function getReturnShippingProvider(forceProvider?: string): ShippingProvider {
  if (forceProvider) return instantiateProvider(forceProvider)

  const settings = getCarrierSettingsSync()
  const providerName =
    settings.returnCarrier ||
    process.env.RETURN_SHIPPING_PROVIDER ||
    process.env.SHIPPING_PROVIDER ||
    'MOCK'

  return instantiateProvider(providerName)
}
