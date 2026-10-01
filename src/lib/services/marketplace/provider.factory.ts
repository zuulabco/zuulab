import type {
  IMarketplaceProvider,
  MarketplaceProviderType,
  MarketplaceStore,
  MarketplaceCredential,
} from './marketplace.interface'
import { HepsiburadaProvider } from './providers/hepsiburada.provider'
import { TrendyolProvider } from './providers/trendyol.provider'
import { MarketplaceError } from './marketplace-error'

export class MarketplaceProviderFactory {
  /**
   * Resolves the appropriate marketplace provider instance for a given store and credential
   */
  public static getProvider(
    store: MarketplaceStore,
    credential?: MarketplaceCredential
  ): IMarketplaceProvider {
    switch (store.provider) {
      case 'HEPSIBURADA':
        return new HepsiburadaProvider(store, credential)

      case 'TRENDYOL':
        return new TrendyolProvider(store, credential)

      default:
        throw new MarketplaceError({
          message: `Desteklenmeyen pazaryeri sağlayıcısı: ${store.provider}`,
          code: 'VALIDATION_ERROR',
          provider: store.provider as MarketplaceProviderType,
        })
    }
  }
}
