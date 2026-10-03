/**
 * How an order status reads to the customer. Shared by the account overview,
 * the order list and the order detail page so the wording never drifts.
 */
export type StatusTone = 'pending' | 'progress' | 'shipped' | 'done' | 'problem'

interface CustomerStatus {
  label: string
  tone: StatusTone
  /** Plain-language next step, shown under the badge. */
  hint: string
  /** Position on the 4-step track (0–3); null when the order left the normal flow. */
  step: number | null
}

const MAP: Record<string, CustomerStatus> = {
  PAYMENT_PENDING: { label: 'ödeme bekliyor', tone: 'pending', hint: 'ödemen tamamlanınca siparişin onaylanır.', step: null },
  PAYMENT_FAILED: { label: 'ödeme alınamadı', tone: 'problem', hint: 'sipariş detayından ödemeyi yeniden deneyebilirsin.', step: null },
  PAYMENT_RECEIVED: { label: 'onaylandı', tone: 'progress', hint: 'ödemen alındı, siparişin sıraya girdi.', step: 0 },
  CONFIRMED: { label: 'onaylandı', tone: 'progress', hint: 'ödemen alındı, siparişin sıraya girdi.', step: 0 },
  PREPARING: { label: 'hazırlanıyor', tone: 'progress', hint: 'parçaların atölyede basılıyor.', step: 1 },
  IN_PRODUCTION: { label: 'hazırlanıyor', tone: 'progress', hint: 'parçaların atölyede basılıyor.', step: 1 },
  PACKING: { label: 'paketleniyor', tone: 'progress', hint: 'siparişin kargoya hazırlanıyor.', step: 1 },
  SHIPPED: { label: 'kargoda', tone: 'shipped', hint: 'takip numarası sipariş detayında.', step: 2 },
  DELIVERED: { label: 'teslim edildi', tone: 'done', hint: 'iyi günlerde kullan.', step: 3 },
  CANCELLED: { label: 'iptal edildi', tone: 'problem', hint: 'ödeme alındıysa iadesi kartına yapılır.', step: null },
  RETURN_REQUESTED: { label: 'iade talebi alındı', tone: 'pending', hint: 'talebin inceleniyor.', step: null },
  RETURNED: { label: 'iade edildi', tone: 'done', hint: 'iade işlemin tamamlandı.', step: null },
  PARTIALLY_REFUNDED: { label: 'kısmi iade', tone: 'done', hint: 'iade edilen tutar kartına yansıtıldı.', step: null },
}

export const ORDER_STEPS = ['onaylandı', 'hazırlanıyor', 'kargoda', 'teslim edildi'] as const

export function customerOrderStatus(status: string): CustomerStatus {
  return MAP[status] ?? { label: status.toLowerCase().replace(/_/g, ' '), tone: 'pending', hint: '', step: null }
}
