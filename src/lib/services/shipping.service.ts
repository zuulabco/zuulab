/**
 * Shipping fee rules, shared by the browser (cart, checkout) and the server (pricing).
 *
 * There is one delivery method. Its carrier, wording, delivery estimate and fee are set
 * in the admin panel (Ayarlar → Kargo) and stored with the store settings; the values
 * below are only the fallback before anything is saved.
 */
export interface ShippingMethod {
  id: 'STANDARD'
  name: string
  carrier: string
  description: string
  price: number
  estimatedDelivery: string
  active: boolean
}

export const FREE_SHIPPING_THRESHOLD = 750

export const DEFAULT_SHIPPING_METHOD: ShippingMethod = {
  id: 'STANDARD',
  name: 'Standart Teslimat',
  carrier: 'Sürat Kargo',
  description: 'Kapıya teslim',
  price: 110,
  estimatedDelivery: '2-3 iş günü',
  active: true,
}

/** Kept for older imports; there is a single method now. */
export const DEFAULT_SHIPPING_METHODS: ShippingMethod[] = [DEFAULT_SHIPPING_METHOD]

/** What the store settings hold about delivery */
export interface ShippingSettings {
  carrier: string
  name: string
  description: string
  estimatedDelivery: string
  fee: number
}

export function shippingMethodFromSettings(s: Partial<ShippingSettings> | null | undefined): ShippingMethod {
  const fee = Number(s?.fee)
  return {
    ...DEFAULT_SHIPPING_METHOD,
    carrier: s?.carrier?.trim() || DEFAULT_SHIPPING_METHOD.carrier,
    name: s?.name?.trim() || DEFAULT_SHIPPING_METHOD.name,
    description: s?.description?.trim() || DEFAULT_SHIPPING_METHOD.description,
    estimatedDelivery: s?.estimatedDelivery?.trim() || DEFAULT_SHIPPING_METHOD.estimatedDelivery,
    price: Number.isFinite(fee) && fee >= 0 ? Math.round(fee * 100) / 100 : DEFAULT_SHIPPING_METHOD.price,
  }
}

export interface ShippingCalculation {
  selectedMethod: ShippingMethod
  shippingFee: number
  isFreeShipping: boolean
  freeShippingThreshold: number
  remainingForFreeShipping: number
  availableMethods: Array<ShippingMethod & { effectivePrice: number }>
}

/**
 * The delivery fee for a cart: free with a free-shipping coupon or once the subtotal
 * reaches the threshold, otherwise the configured fee.
 */
export function calculateShipping(
  subtotal: number,
  isFreeShippingCoupon = false,
  freeShippingThreshold: number = FREE_SHIPPING_THRESHOLD,
  method: ShippingMethod = DEFAULT_SHIPPING_METHOD
): ShippingCalculation {
  const isFreeThresholdMet = subtotal >= freeShippingThreshold
  const remaining = Math.max(0, Math.round((freeShippingThreshold - subtotal) * 100) / 100)
  const effectivePrice = isFreeShippingCoupon || isFreeThresholdMet ? 0 : method.price

  return {
    selectedMethod: method,
    shippingFee: effectivePrice,
    isFreeShipping: effectivePrice === 0,
    freeShippingThreshold,
    remainingForFreeShipping: isFreeShippingCoupon ? 0 : remaining,
    availableMethods: [{ ...method, effectivePrice }],
  }
}
