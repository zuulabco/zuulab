export interface ShippingMethod {
  id: 'STANDARD' | 'EXPRESS'
  name: string
  carrier: string
  description: string
  price: number
  estimatedDelivery: string
  active: boolean
}

export const FREE_SHIPPING_THRESHOLD = 750

export const DEFAULT_SHIPPING_METHODS: ShippingMethod[] = [
  {
    id: 'STANDARD',
    name: 'Standart Teslimat',
    carrier: 'Yurtiçi Kargo / MNG',
    description: 'Kapıya teslim güvenli gönderi',
    price: 49.9,
    estimatedDelivery: '2-3 iş günü',
    active: true,
  },
  {
    id: 'EXPRESS',
    name: 'Hızlı Kargo (Öncelikli Üretim)',
    carrier: 'Yurtiçi Kargo Express',
    description: 'Aynı gün öncelikli atölye hazırlığı',
    price: 89.9,
    estimatedDelivery: '1-2 iş günü',
    active: true,
  },
]

export interface ShippingCalculation {
  selectedMethod: ShippingMethod
  shippingFee: number
  isFreeShipping: boolean
  freeShippingThreshold: number
  remainingForFreeShipping: number
  availableMethods: Array<ShippingMethod & { effectivePrice: number }>
}

/**
 * Calculates shipping rates dynamically based on subtotal and coupon
 */
export function calculateShipping(
  subtotal: number,
  methodId: 'STANDARD' | 'EXPRESS' = 'STANDARD',
  isFreeShippingCoupon = false,
  freeShippingThreshold: number = FREE_SHIPPING_THRESHOLD
): ShippingCalculation {
  const isFreeThresholdMet = subtotal >= freeShippingThreshold
  const remaining = Math.max(0, Math.round((freeShippingThreshold - subtotal) * 100) / 100)

  const selected =
    DEFAULT_SHIPPING_METHODS.find((m) => m.id === methodId) ||
    DEFAULT_SHIPPING_METHODS[0]

  const availableMethods = DEFAULT_SHIPPING_METHODS.map((method) => {
    let effectivePrice = method.price
    if (isFreeShippingCoupon) {
      effectivePrice = 0
    } else if (isFreeThresholdMet && method.id === 'STANDARD') {
      effectivePrice = 0
    } else if (isFreeThresholdMet && method.id === 'EXPRESS') {
      // Discounted express if threshold met
      effectivePrice = Math.max(0, method.price - 49.9)
    }
    return {
      ...method,
      effectivePrice,
    }
  })

  const selectedWithEffective =
    availableMethods.find((m) => m.id === selected.id) || availableMethods[0]

  return {
    selectedMethod: selected,
    shippingFee: selectedWithEffective.effectivePrice,
    isFreeShipping: selectedWithEffective.effectivePrice === 0,
    freeShippingThreshold,
    remainingForFreeShipping: isFreeShippingCoupon ? 0 : remaining,
    availableMethods,
  }
}
