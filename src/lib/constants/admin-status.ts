/**
 * Centralized Administrative Status Dictionary & Semantic Styling Tokens
 * Authoritative mapping for OrderStatus, PaymentStatus, and ShipmentStatus
 */

export interface StatusConfigItem {
  key: string
  label: string
  badgeClass: string
  description?: string
}

export const ORDER_STATUS_MAP: Record<string, StatusConfigItem> = {
  PAYMENT_PENDING: {
    key: 'PAYMENT_PENDING',
    label: 'Ödeme Bekliyor',
    badgeClass: 'badgeWarning',
    description: 'Müşteri ödeme adımında veya provizyon bekliyor.',
  },
  PAYMENT_FAILED: {
    key: 'PAYMENT_FAILED',
    label: 'Ödeme Başarısız',
    badgeClass: 'badgeDanger',
    description: 'Banka veya ödeme kuruluşu ödemeyi reddetti.',
  },
  PAYMENT_RECEIVED: {
    key: 'PAYMENT_RECEIVED',
    label: 'Ödeme Alındı',
    badgeClass: 'badgeSuccess',
    description: 'Ödeme başarıyla tahsil edildi.',
  },
  CONFIRMED: {
    key: 'CONFIRMED',
    label: 'Onaylandı',
    badgeClass: 'badgeActive',
    description: 'Sipariş doğrulandı, üretim ve paketlemeye hazır.',
  },
  PREPARING: {
    key: 'PREPARING',
    label: 'Hazırlanıyor',
    badgeClass: 'badgeInfo',
    description: 'Sipariş deposunda paketleme veya atölye aşamasında.',
  },
  IN_PRODUCTION: {
    key: 'IN_PRODUCTION',
    label: '3D Baskıda',
    badgeClass: 'badgeInfo',
    description: 'Siparişteki ürünler 3D yazıcı atölyesinde basılıyor.',
  },
  PACKING: {
    key: 'PACKING',
    label: 'Paketleniyor',
    badgeClass: 'badgeInfo',
    description: 'Ürünler koruyucu kutulamaya alındı.',
  },
  SHIPPED: {
    key: 'SHIPPED',
    label: 'Kargoya Verildi',
    badgeClass: 'badgeActive',
    description: 'Kargo kuryesine teslim edildi ve takip kodu üretildi.',
  },
  DELIVERED: {
    key: 'DELIVERED',
    label: 'Teslim Edildi',
    badgeClass: 'badgeSuccess',
    description: 'Müşteriye başarıyla teslim edildi.',
  },
  CANCELLED: {
    key: 'CANCELLED',
    label: 'İptal Edildi',
    badgeClass: 'badgeDanger',
    description: 'Sipariş iptal edildi ve stok rezervasyonu kaldırıldı.',
  },
  RETURN_REQUESTED: {
    key: 'RETURN_REQUESTED',
    label: 'İade Talebi',
    badgeClass: 'badgeWarning',
    description: 'Müşteri iade başvurusunda bulundu.',
  },
  RETURNED: {
    key: 'RETURNED',
    label: 'İade Alındı',
    badgeClass: 'badgeNeutral',
    description: 'İade depoya ulaştı ve incelendi.',
  },
  PARTIALLY_REFUNDED: {
    key: 'PARTIALLY_REFUNDED',
    label: 'Kısmi İade',
    badgeClass: 'badgeNeutral',
    description: 'Siparişin bir kısmı için geri ödeme yapıldı.',
  },
}

export const PAYMENT_STATUS_MAP: Record<string, StatusConfigItem> = {
  PENDING: { key: 'PENDING', label: 'Beklemede', badgeClass: 'badgeWarning' },
  PROCESSING: { key: 'PROCESSING', label: 'İşleniyor', badgeClass: 'badgeInfo' },
  SUCCEEDED: { key: 'SUCCEEDED', label: 'Ödendi', badgeClass: 'badgeSuccess' },
  PAID: { key: 'PAID', label: 'Ödendi', badgeClass: 'badgeSuccess' },
  FAILED: { key: 'FAILED', label: 'Başarısız', badgeClass: 'badgeDanger' },
  REFUNDED: { key: 'REFUNDED', label: 'İade Edildi', badgeClass: 'badgeNeutral' },
  PARTIALLY_REFUNDED: { key: 'PARTIALLY_REFUNDED', label: 'Kısmi İade', badgeClass: 'badgeNeutral' },
  CANCELLED: { key: 'CANCELLED', label: 'İptal', badgeClass: 'badgeDanger' },
}

export const SHIPMENT_STATUS_MAP: Record<string, StatusConfigItem> = {
  PENDING: { key: 'PENDING', label: 'Hazırlanacak', badgeClass: 'badgeWarning' },
  LABEL_READY: { key: 'LABEL_READY', label: 'Etiket Hazır', badgeClass: 'badgeInfo' },
  PICKED_UP: { key: 'PICKED_UP', label: 'Kurye Aldı', badgeClass: 'badgeInfo' },
  IN_TRANSIT: { key: 'IN_TRANSIT', label: 'Kargoda (Yolda)', badgeClass: 'badgeActive' },
  OUT_FOR_DELIVERY: { key: 'OUT_FOR_DELIVERY', label: 'Dağıtımda', badgeClass: 'badgeActive' },
  DELIVERED: { key: 'DELIVERED', label: 'Teslim Edildi', badgeClass: 'badgeSuccess' },
  FAILED: { key: 'FAILED', label: 'Teslim Edilemedi', badgeClass: 'badgeDanger' },
  CANCELLED: { key: 'CANCELLED', label: 'İptal Edildi', badgeClass: 'badgeNeutral' },
  RETURNED: { key: 'RETURNED', label: 'İade Döndü', badgeClass: 'badgeNeutral' },
}

export const INVOICE_STATUS_MAP: Record<string, StatusConfigItem> = {
  PENDING: { key: 'PENDING', label: 'Fatura Bekliyor', badgeClass: 'badgeWarning' },
  CREATED: { key: 'CREATED', label: 'Taslak Hazır', badgeClass: 'badgeInfo' },
  SUBMITTED: { key: 'SUBMITTED', label: 'GİB Kuyruğunda', badgeClass: 'badgeInfo' },
  ISSUED: { key: 'ISSUED', label: 'Resmi Kesildi', badgeClass: 'badgeSuccess' },
  SENT: { key: 'SENT', label: 'Resmi Kesildi', badgeClass: 'badgeSuccess' },
  PAID: { key: 'PAID', label: 'Ödendi', badgeClass: 'badgeSuccess' },
  FAILED: { key: 'FAILED', label: 'Fatura Hatası', badgeClass: 'badgeDanger' },
  CANCELLED: { key: 'CANCELLED', label: 'İptal Edildi', badgeClass: 'badgeNeutral' },
}

export const RETURN_STATUS_MAP: Record<string, StatusConfigItem> = {
  REQUESTED: { key: 'REQUESTED', label: 'Talep Alındı', badgeClass: 'badgeWarning' },
  UNDER_REVIEW: { key: 'UNDER_REVIEW', label: 'İnceleniyor', badgeClass: 'badgeInfo' },
  APPROVED: { key: 'APPROVED', label: 'Onaylandı', badgeClass: 'badgeActive' },
  RETURN_SHIPPING_CREATED: { key: 'RETURN_SHIPPING_CREATED', label: 'Kargo Kodu Hazır', badgeClass: 'badgeInfo' },
  IN_TRANSIT: { key: 'IN_TRANSIT', label: 'İade Kargoda', badgeClass: 'badgeActive' },
  RECEIVED: { key: 'RECEIVED', label: 'Depoya Ulaştı', badgeClass: 'badgeInfo' },
  INSPECTED: { key: 'INSPECTED', label: 'Kontrol Edildi', badgeClass: 'badgeActive' },
  REFUND_PENDING: { key: 'REFUND_PENDING', label: 'Geri Ödeme Bekliyor', badgeClass: 'badgeWarning' },
  EXCHANGE_PENDING: { key: 'EXCHANGE_PENDING', label: 'Değişim Hazırlanıyor', badgeClass: 'badgeInfo' },
  COMPLETED: { key: 'COMPLETED', label: 'Tamamlandı', badgeClass: 'badgeSuccess' },
  REJECTED: { key: 'REJECTED', label: 'Reddedildi', badgeClass: 'badgeDanger' },
  CANCELLED: { key: 'CANCELLED', label: 'İptal Edildi', badgeClass: 'badgeNeutral' },
  FAILED: { key: 'FAILED', label: 'Başarısız', badgeClass: 'badgeDanger' },
}

export const REVIEW_STATUS_MAP: Record<string, StatusConfigItem> = {
  PENDING: { key: 'PENDING', label: 'Onay Bekliyor', badgeClass: 'badgeWarning' },
  APPROVED: { key: 'APPROVED', label: 'Yayında', badgeClass: 'badgeSuccess' },
  REJECTED: { key: 'REJECTED', label: 'Gizlendi / Red', badgeClass: 'badgeDanger' },
}

export const SUPPORT_STATUS_MAP: Record<string, StatusConfigItem> = {
  OPEN: { key: 'OPEN', label: 'Açık', badgeClass: 'badgeWarning' },
  IN_PROGRESS: { key: 'IN_PROGRESS', label: 'İşleniyor', badgeClass: 'badgeInfo' },
  WAITING_CUSTOMER: { key: 'WAITING_CUSTOMER', label: 'Müşteri Yanıtı', badgeClass: 'badgeNeutral' },
  RESOLVED: { key: 'RESOLVED', label: 'Çözüldü', badgeClass: 'badgeSuccess' },
  CLOSED: { key: 'CLOSED', label: 'Kapatıldı', badgeClass: 'badgeNeutral' },
}

export const CUSTOMER_STATUS_MAP: Record<string, StatusConfigItem> = {
  ACTIVE: { key: 'ACTIVE', label: 'Aktif', badgeClass: 'badgeSuccess' },
  SUSPENDED: { key: 'SUSPENDED', label: 'Askıda / Pasif', badgeClass: 'badgeDanger' },
}

export function getOrderStatusConfig(status: string): StatusConfigItem {
  return ORDER_STATUS_MAP[status] || {
    key: status,
    label: status,
    badgeClass: 'badgeNeutral',
  }
}

export function getPaymentStatusConfig(status: string): StatusConfigItem {
  return PAYMENT_STATUS_MAP[status] || {
    key: status,
    label: status,
    badgeClass: 'badgeNeutral',
  }
}

export function getShipmentStatusConfig(status: string): StatusConfigItem {
  return SHIPMENT_STATUS_MAP[status] || {
    key: status,
    label: status,
    badgeClass: 'badgeNeutral',
  }
}

export function getInvoiceStatusConfig(status: string): StatusConfigItem {
  return INVOICE_STATUS_MAP[status] || {
    key: status,
    label: status,
    badgeClass: 'badgeNeutral',
  }
}

export function getReturnStatusConfig(status: string): StatusConfigItem {
  return RETURN_STATUS_MAP[status] || {
    key: status,
    label: status,
    badgeClass: 'badgeNeutral',
  }
}

export function getReviewStatusConfig(status: string): StatusConfigItem {
  return REVIEW_STATUS_MAP[status] || {
    key: status,
    label: status,
    badgeClass: 'badgeNeutral',
  }
}

export function getSupportStatusConfig(status: string): StatusConfigItem {
  return SUPPORT_STATUS_MAP[status] || {
    key: status,
    label: status,
    badgeClass: 'badgeNeutral',
  }
}

export function getCustomerStatusConfig(status: string): StatusConfigItem {
  return CUSTOMER_STATUS_MAP[status] || {
    key: status,
    label: status,
    badgeClass: 'badgeNeutral',
  }
}

export const INVENTORY_STATUS_MAP: Record<string, StatusConfigItem> = {
  IN_STOCK: { key: 'IN_STOCK', label: 'Stokta', badgeClass: 'badgeSuccess' },
  LOW_STOCK: { key: 'LOW_STOCK', label: 'Kritik Stok', badgeClass: 'badgeWarning' },
  OUT_OF_STOCK: { key: 'OUT_OF_STOCK', label: 'Tükendi', badgeClass: 'badgeDanger' },
  RESERVED: { key: 'RESERVED', label: 'Rezerve', badgeClass: 'badgeInfo' },
  IN_PRODUCTION: { key: 'IN_PRODUCTION', label: 'Üretimde', badgeClass: 'badgeInfo' },
}

export function getInventoryStatusConfig(status: string): StatusConfigItem {
  return INVENTORY_STATUS_MAP[status] || {
    key: status,
    label: status,
    badgeClass: 'badgeNeutral',
  }
}

export const MATERIAL_READINESS_STATUS_MAP: Record<string, StatusConfigItem> = {
  READY: { key: 'READY', label: 'Hazır / Yeterli', badgeClass: 'badgeSuccess' },
  LOW: { key: 'LOW', label: 'Kritik Seviye', badgeClass: 'badgeWarning' },
  BLOCKED: { key: 'BLOCKED', label: 'Yetersiz / Eksik', badgeClass: 'badgeDanger' },
  UNKNOWN: { key: 'UNKNOWN', label: 'Bilinmiyor', badgeClass: 'badgeNeutral' },
}

export function getMaterialReadinessStatusConfig(status: string): StatusConfigItem {
  return MATERIAL_READINESS_STATUS_MAP[status] || {
    key: status,
    label: status,
    badgeClass: 'badgeNeutral',
  }
}

export const WAVE_STATUS_MAP: Record<string, StatusConfigItem> = {
  PLANNED: { key: 'PLANNED', label: 'Planlandı', badgeClass: 'badgeNeutral' },
  IN_PROGRESS: { key: 'IN_PROGRESS', label: 'Hazırlanıyor', badgeClass: 'badgeInfo' },
  COMPLETED: { key: 'COMPLETED', label: 'Tamamlandı', badgeClass: 'badgeSuccess' },
  CANCELLED: { key: 'CANCELLED', label: 'İptal Edildi', badgeClass: 'badgeDanger' },
}

export function getWaveStatusConfig(status: string): StatusConfigItem {
  return WAVE_STATUS_MAP[status] || {
    key: status,
    label: status,
    badgeClass: 'badgeNeutral',
  }
}

export const PRODUCTION_STATUS_MAP: Record<string, StatusConfigItem> = {
  PLANNED: { key: 'PLANNED', label: 'Planlandı', badgeClass: 'badgeNeutral' },
  QUEUED: { key: 'QUEUED', label: 'Sırada', badgeClass: 'badgeWarning' },
  IN_PROGRESS: { key: 'IN_PROGRESS', label: 'Baskıda', badgeClass: 'badgeInfo' },
  COMPLETED: { key: 'COMPLETED', label: 'Tamamlandı', badgeClass: 'badgeActive' },
  STOCKED: { key: 'STOCKED', label: 'Stoğa Alındı', badgeClass: 'badgeSuccess' },
  FAILED: { key: 'FAILED', label: 'Hatalı / Fire', badgeClass: 'badgeDanger' },
  CANCELLED: { key: 'CANCELLED', label: 'İptal', badgeClass: 'badgeNeutral' },
}

export function getProductionStatusConfig(status: string): StatusConfigItem {
  return PRODUCTION_STATUS_MAP[status] || {
    key: status,
    label: status,
    badgeClass: 'badgeNeutral',
  }
}

export const USER_ROLE_MAP: Record<string, StatusConfigItem> = {
  SUPER_ADMIN: { key: 'SUPER_ADMIN', label: 'Süper Admin', badgeClass: 'badgeDanger', description: 'Tüm yetkilere tam erişim' },
  ADMIN: { key: 'ADMIN', label: 'Admin', badgeClass: 'badgeActive', description: 'Yönetim ve operasyon yetkileri' },
  ORDER_MANAGER: { key: 'ORDER_MANAGER', label: 'Sipariş Yöneticisi', badgeClass: 'badgeInfo', description: 'Sipariş, kargo ve depo işlemleri' },
  CONTENT_MANAGER: { key: 'CONTENT_MANAGER', label: 'İçerik Yöneticisi', badgeClass: 'badgeInfo', description: 'CMS, vitrin ve ürün içerikleri' },
  SUPPORT: { key: 'SUPPORT', label: 'Müşteri Desteği', badgeClass: 'badgeWarning', description: 'Müşteri, talep ve iade yönetimi' },
  STAFF: { key: 'STAFF', label: 'Depo & Personel', badgeClass: 'badgeNeutral', description: 'Depo, hazırlık ve atölye' },
  CUSTOMER: { key: 'CUSTOMER', label: 'Müşteri', badgeClass: 'badgeNeutral', description: 'Standart mağaza kullanıcısı' },
}

export function getUserRoleConfig(role: string): StatusConfigItem {
  return USER_ROLE_MAP[role] || {
    key: role,
    label: role,
    badgeClass: 'badgeNeutral',
  }
}

export const CONTENT_STATUS_MAP: Record<string, StatusConfigItem> = {
  ACTIVE: { key: 'ACTIVE', label: 'Yayında', badgeClass: 'badgeSuccess' },
  DRAFT: { key: 'DRAFT', label: 'Taslak', badgeClass: 'badgeWarning' },
  ARCHIVED: { key: 'ARCHIVED', label: 'Arşiv', badgeClass: 'badgeNeutral' },
  SCHEDULED: { key: 'SCHEDULED', label: 'Planlandı', badgeClass: 'badgeInfo' },
}

export function getContentStatusConfig(status: string): StatusConfigItem {
  return CONTENT_STATUS_MAP[status] || {
    key: status,
    label: status,
    badgeClass: 'badgeNeutral',
  }
}

// ─────────────────────────────────────────────────────────────
// MARKETPLACE & INTEGRATION STATUS
// ─────────────────────────────────────────────────────────────
export const MARKETPLACE_STATUS_MAP: Record<string, StatusConfigItem> = {
  ACTIVE: { key: 'ACTIVE', label: 'Aktif Bağlantı', badgeClass: 'badgeSuccess', description: 'API bağlantısı çalışıyor ve senkronizasyon açık.' },
  INACTIVE: { key: 'INACTIVE', label: 'Devre Dışı', badgeClass: 'badgeNeutral', description: 'Mağaza bağlantısı durduruldu.' },
  ERROR: { key: 'ERROR', label: 'Bağlantı Hatası', badgeClass: 'badgeDanger', description: 'API kimlik doğrulama veya yetki hatası mevcut.' },
  PENDING: { key: 'PENDING', label: 'Kurulum Bekliyor', badgeClass: 'badgeWarning', description: 'API anahtarları girilmemiş veya test edilmemiş.' },
}

export function getMarketplaceStatusConfig(status: string): StatusConfigItem {
  return MARKETPLACE_STATUS_MAP[status] || {
    key: status,
    label: status,
    badgeClass: 'badgeNeutral',
  }
}

export const MARKETPLACE_SYNC_STATUS_MAP: Record<string, StatusConfigItem> = {
  SUCCESS: { key: 'SUCCESS', label: 'Senkronize', badgeClass: 'badgeSuccess' },
  SYNCED: { key: 'SYNCED', label: 'Senkronize', badgeClass: 'badgeSuccess' },
  PROCESSING: { key: 'PROCESSING', label: 'İşleniyor', badgeClass: 'badgeInfo' },
  PENDING: { key: 'PENDING', label: 'Kuyrukta', badgeClass: 'badgeWarning' },
  RETRYING: { key: 'RETRYING', label: 'Tekrar Deneniyor', badgeClass: 'badgeWarning' },
  FAILED: { key: 'FAILED', label: 'Hata', badgeClass: 'badgeDanger' },
  SKIPPED: { key: 'SKIPPED', label: 'Atlandı', badgeClass: 'badgeNeutral' },
}

export function getMarketplaceSyncStatusConfig(status: string): StatusConfigItem {
  return MARKETPLACE_SYNC_STATUS_MAP[status] || {
    key: status,
    label: status,
    badgeClass: 'badgeNeutral',
  }
}

export const MARKETPLACE_ORDER_STATUS_MAP: Record<string, StatusConfigItem> = {
  CREATED: { key: 'CREATED', label: 'Yeni Sipariş', badgeClass: 'badgeWarning' },
  PICKING: { key: 'PICKING', label: 'Toplanıyor', badgeClass: 'badgeInfo' },
  INVOICED: { key: 'INVOICED', label: 'Faturalandı', badgeClass: 'badgeInfo' },
  SHIPPED: { key: 'SHIPPED', label: 'Kargoya Verildi', badgeClass: 'badgeActive' },
  DELIVERED: { key: 'DELIVERED', label: 'Teslim Edildi', badgeClass: 'badgeSuccess' },
  CANCELLED: { key: 'CANCELLED', label: 'İptal', badgeClass: 'badgeDanger' },
  UNPACKED: { key: 'UNPACKED', label: 'Paket Bekliyor', badgeClass: 'badgeNeutral' },
}

export function getMarketplaceOrderStatusConfig(status: string): StatusConfigItem {
  return MARKETPLACE_ORDER_STATUS_MAP[status] || {
    key: status,
    label: status,
    badgeClass: 'badgeNeutral',
  }
}

export const MAPPING_STATUS_MAP: Record<string, StatusConfigItem> = {
  MATCHED: { key: 'MATCHED', label: 'Eşleşti', badgeClass: 'badgeSuccess', description: 'Tüm kalemler ZUULAB SKU ile birebir eşleşti.' },
  MAPPED: { key: 'MAPPED', label: 'Eşleştirildi', badgeClass: 'badgeSuccess' },
  PARTIALLY_MATCHED: { key: 'PARTIALLY_MATCHED', label: 'Kısmi Eşleşme', badgeClass: 'badgeWarning', description: 'Bazı ürünlerin katalog eşlemesi eksik.' },
  UNMATCHED: { key: 'UNMATCHED', label: 'Eşleşmemiş SKU', badgeClass: 'badgeDanger', description: 'Pazaryeri SKU sistemde bulunamadı.' },
  UNMAPPED: { key: 'UNMAPPED', label: 'Eşleşmemiş', badgeClass: 'badgeNeutral' },
  CONFLICT: { key: 'CONFLICT', label: 'Çakışma', badgeClass: 'badgeDanger' },
  PENDING: { key: 'PENDING', label: 'İnceleniyor', badgeClass: 'badgeWarning' },
  ERROR: { key: 'ERROR', label: 'Eşleme Hatası', badgeClass: 'badgeDanger' },
  INACTIVE: { key: 'INACTIVE', label: 'Pasif Eşleme', badgeClass: 'badgeNeutral' },
}

export function getMappingStatusConfig(status: string): StatusConfigItem {
  return MAPPING_STATUS_MAP[status] || {
    key: status,
    label: status,
    badgeClass: 'badgeNeutral',
  }
}

export const NOTIFICATION_STATUS_MAP: Record<string, StatusConfigItem> = {
  SENT: { key: 'SENT', label: 'Gönderildi', badgeClass: 'badgeSuccess' },
  PENDING: { key: 'PENDING', label: 'Kuyrukta Bekliyor', badgeClass: 'badgeWarning' },
  PROCESSING: { key: 'PROCESSING', label: 'İletiliyor', badgeClass: 'badgeInfo' },
  FAILED: { key: 'FAILED', label: 'Başarısız / Hata', badgeClass: 'badgeDanger' },
}

export function getNotificationStatusConfig(status: string): StatusConfigItem {
  return NOTIFICATION_STATUS_MAP[status] || {
    key: status,
    label: status,
    badgeClass: 'badgeNeutral',
  }
}

