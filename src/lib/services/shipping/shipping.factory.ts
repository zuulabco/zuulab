import type { ICargoProvider } from './shipping.interface'
import type { CarrierProviderType } from './shipping-types'
import { MockCargoProvider } from './providers/mock.provider'
import { SuratCargoProvider } from './providers/surat.provider'
import { PttCargoProvider } from './providers/ptt.provider'
import { CargoNotImplementedError } from './shipping-error'

export class CargoProviderFactory {
  private static providerInstances: Map<CarrierProviderType, ICargoProvider> = new Map()

  /**
   * Resolves a cargo provider implementation by carrier key
   * Rejects unknown carriers with an explicit CargoNotImplementedError
   */
  public static getProvider(providerKey: string): ICargoProvider {
    const key = (providerKey || '').trim().toUpperCase() as CarrierProviderType

    switch (key) {
      case 'SURAT':
        return new SuratCargoProvider()
      case 'PTT':
        return new PttCargoProvider()
      case 'MOCK':
        return new MockCargoProvider()
      default:
        throw new CargoNotImplementedError(`Desteklenmeyen kargo sağlayıcısı: '${providerKey}'`, key)
    }
  }

  /**
   * Clears cached instances (useful in test isolation)
   */
  public static reset(): void {
    this.providerInstances.clear()
  }
}
