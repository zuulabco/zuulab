import 'server-only'
import { getStoreSettings } from '@/lib/services/settings/store-settings.service'

const tl = (n: number) => `${n.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} TL`

/**
 * Shipping fee and free-shipping threshold as set in the admin (Ayarlar), so the
 * contracts and the shipping page never state a stale amount.
 */
export async function getShippingTerms() {
  const s = await getStoreSettings()
  return {
    fee: tl(s.shipping.fee),
    freeFrom: tl(s.freeShippingThreshold),
    transit: s.shipping.estimatedDelivery,
  }
}
