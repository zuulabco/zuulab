/** Kapıda ödeme desk: stage labels shared by the list and the detail page */
export const COD_STAGES: Record<string, { label: string; badge: string }> = {
  NEW: { label: 'Geliver’e eklenmedi', badge: 'badgeNeutral' },
  ADDED: { label: 'Geliver’e eklendi', badge: 'badgeInfo' },
  READY: { label: 'Kargo bilgileri hazır', badge: 'badgeInfo' },
  LABEL: { label: 'Etiket hazır, PTT’ye teslim bekliyor', badge: 'badgeWarning' },
  SHIPPED: { label: 'Kargoya verildi', badge: 'badgeWarning' },
  DELIVERED: { label: 'Teslim edildi, tahsil edildi', badge: 'badgeSuccess' },
  FAILED: { label: 'Teslim edilemedi / iade', badge: 'badgeDanger' },
  CANCELLED: { label: 'Sipariş iptal', badge: 'badgeDanger' },
}
