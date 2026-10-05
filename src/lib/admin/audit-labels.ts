/**
 * Turns an audit row (action code + entity + metadata) into a sentence an admin can read.
 * Unknown codes fall back to a readable form of the code, never the raw one.
 */

export interface AuditRow {
  action: string
  entity?: string | null
  entityId?: string | null
  metadata?: Record<string, unknown> | null
}

const SENTENCES: Record<string, string> = {
  // Ödeme
  PAYMENT_CREATED: 'Ödeme başlatıldı',
  PAYMENT_PAID: 'Ödeme alındı',
  PAYMENT_FAILED: 'Ödeme başarısız oldu',
  PAYMENT_RECONCILED: 'Ödeme durumu kontrol edilip güncellendi',
  PAYMENT_RETRY_INITIATED: 'Ödeme yeniden denendi',
  PAYMENT_AMOUNT_MISMATCH: 'Ödenen tutar sipariş tutarıyla uyuşmuyor',
  PAYMENT_CURRENCY_MISMATCH: 'Ödeme para birimi uyuşmuyor',
  PAYMENT_AMOUNT_TAMPER_ATTEMPT: 'Ödeme tutarı değiştirilmeye çalışıldı',
  PAYMENT_DUPLICATE_CAPTURE: 'Aynı sipariş için ikinci ödeme alındı, iade gerekiyor',
  PAYMENT_WEBHOOK_REJECTED: 'Ödeme bildirimi imzası geçersiz, reddedildi',
  PAYMENT_WEBHOOK_UNMATCHED: 'Ödeme bildirimi hiçbir siparişle eşleşmedi',
  BANK_TRANSFER_CONFIRMED: 'Havale ödemesi onaylandı',
  // Sipariş
  ORDER_CREATED: 'Yeni sipariş oluşturuldu',
  ORDER_CANCELLED: 'Sipariş iptal edildi',
  ORDER_STATUS_CHANGED: 'Sipariş durumu değişti',
  ORDER_INTERNAL_NOTE_ADDED: 'Siparişe iç not eklendi',
  ORDER_OVERSOLD: 'Stoktan fazla satış yapıldı (stok eksiye düştü)',
  // Bilgilendirme e-postaları
  NOTIFICATION_CREATED: 'Müşteri bilgilendirmesi hazırlandı',
  NOTIFICATION_SENT: 'Müşteriye bilgilendirme e-postası gönderildi',
  NOTIFICATION_FAILED: 'Müşteriye bilgilendirme e-postası gönderilemedi',
  NOTIFICATION_DUPLICATE_SUPPRESSED: 'Aynı bilgilendirme ikinci kez gönderilmedi',
  NOTIFICATION_RETRY_REQUESTED: 'Bilgilendirme e-postası yeniden gönderilmek üzere istendi',
  // Kargo
  SHIPMENT_CREATED: 'Kargo kaydı oluşturuldu',
  SHIPMENT_CANCELLED: 'Kargo iptal edildi',
  SHIPMENT_LABEL_GENERATED: 'Kargo etiketi oluşturuldu',
  SHIPMENT_TRACKING_UPDATED: 'Kargo takip durumu güncellendi',
  SHIPMENT_NOT_DELIVERED: 'Kargo teslim edilemedi',
  SHIPMENT_WEBHOOK_RECEIVED: 'Kargo firmasından bildirim alındı',
  SHIPMENT_IDEMPOTENT_BYPASS: 'Aynı kargo isteği tekrar geldi, yeni kayıt açılmadı',
  // İade
  RETURN_CREATED: 'İade talebi oluşturuldu',
  RETURN_APPROVED: 'İade talebi onaylandı',
  RETURN_REJECTED: 'İade talebi reddedildi',
  RETURN_CANCELLED: 'İade talebi iptal edildi',
  RETURN_RECEIVED: 'İade ürünü teslim alındı',
  RETURN_INSPECTED: 'İade ürünü incelendi',
  RETURN_SHIPMENT_CREATED: 'İade kargosu oluşturuldu',
  RETURN_EXCHANGE_CREATED: 'Değişim siparişi oluşturuldu',
  RETURN_REFUND_COMPLETED: 'İade tutarı müşteriye ödendi',
  RETURN_REFUND_FAILED: 'İade ödemesi başarısız oldu',
  RETURN_REFUND_UNKNOWN: 'İade ödemesinin sonucu belirsiz, kontrol gerekiyor',
  // Ürün / katalog
  PRODUCT_CREATED: 'Ürün eklendi',
  PRODUCT_UPDATED: 'Ürün güncellendi',
  PRODUCT_DETAILS_UPDATED: 'Ürün detayları güncellendi',
  PRODUCT_VARIANTS_UPDATED: 'Ürün seçenekleri güncellendi',
  PRODUCT_COST_PROFILE_UPDATED: 'Ürün maliyet bilgisi güncellendi',
  PRODUCT_DUPLICATED: 'Ürün kopyalandı',
  PRODUCT_DELETED: 'Ürün silindi',
  PRODUCT_BULK_UPDATED: 'Birden fazla ürün toplu güncellendi',
  CATEGORY_CREATED: 'Kategori eklendi',
  CATEGORY_UPDATED: 'Kategori güncellendi',
  CATEGORY_DELETED: 'Kategori silindi',
  COLLECTION_CREATED: 'Koleksiyon eklendi',
  COLLECTION_UPDATED: 'Koleksiyon güncellendi',
  COLLECTION_DELETED: 'Koleksiyon silindi',
  // Stok / üretim
  INVENTORY_ADJUSTED: 'Stok elle düzeltildi',
  INVENTORY_COUNTED: 'Stok sayımı kaydedildi',
  INVENTORY_RESERVED: 'Sipariş için stok ayrıldı',
  INVENTORY_RELEASED: 'Ayrılan stok serbest bırakıldı',
  INVENTORY_COMMITTED: 'Stok siparişe düşüldü',
  INVENTORY_RESTOCKED_FROM_RETURN: 'İade edilen ürün stoğa geri eklendi',
  INVENTORY_TIMEOUT_CLEANUP: 'Süresi dolan stok ayrılmaları temizlendi',
  MATERIAL_CREATED: 'Filament/malzeme eklendi',
  MATERIAL_UPDATED: 'Filament/malzeme güncellendi',
  MATERIAL_ADJUSTED: 'Filament/malzeme stoğu düzeltildi',
  MATERIAL_DELETED: 'Filament/malzeme silindi',
  MATERIAL_PRICE_UPDATED: 'Filament/malzeme fiyatı güncellendi',
  PRODUCTION_ORDER_CREATED: 'Üretim emri oluşturuldu',
  PRODUCTION_ORDER_STARTED: 'Üretim başladı',
  PRODUCTION_ORDER_STOCKED: 'Üretilen ürünler stoğa eklendi',
  PRODUCTION_ORDER_FAILED: 'Üretim başarısız oldu',
  PRODUCTION_ORDER_CANCELLED: 'Üretim emri iptal edildi',
  // Fatura
  INVOICE_CREATION_REJECTED: 'Fatura oluşturulamadı',
  INVOICE_IDEMPOTENT_BYPASS: 'Fatura zaten vardı, yenisi kesilmedi',
  INVOICE_AMOUNT_MISMATCH: 'Fatura tutarı sipariş tutarıyla uyuşmuyor',
  INVOICE_RETRY_REQUESTED: 'Fatura yeniden kesilmek üzere istendi',
  INVOICE_STATUS_SYNCED: 'Fatura durumu güncellendi',
  INVOICE_PDF_ACCESSED: 'Fatura PDF’i açıldı',
  // İçerik / site
  CONTENT_SAVED_DRAFT: 'Ana sayfa içeriği taslak olarak kaydedildi',
  CONTENT_PUBLISHED: 'Ana sayfa içeriği yayınlandı',
  ANNOUNCEMENTS_UPDATED: 'Duyuru çubuğu güncellendi',
  MEDIA_UPLOADED: 'Medya dosyası yüklendi',
  MEDIA_DELETED: 'Medya dosyası silindi',
  SETTINGS_UPDATED: 'Ayarlar güncellendi',
  SOCIAL_LINKS_UPDATED: 'Sosyal medya bağlantıları güncellendi',
  CHANNEL_FEE_CONFIG_UPDATED: 'Satış kanalı komisyon ayarı güncellendi',
  // Pazarlama
  COUPON_CREATED: 'İndirim kuponu oluşturuldu',
  COUPON_UPDATED: 'İndirim kuponu güncellendi',
  CAMPAIGN_CREATED: 'Kampanya oluşturuldu',
  CAMPAIGN_UPDATED: 'Kampanya güncellendi',
  CAMPAIGN_TOGGLED: 'Kampanya açıldı/kapatıldı',
  CAMPAIGN_DELETED: 'Kampanya silindi',
  EMAIL_CAMPAIGN_SENT: 'E-posta kampanyası gönderildi',
  EMAIL_AUTOMATION_TOGGLED: 'Otomatik e-posta açıldı/kapatıldı',
  META_CAMPAIGN_CREATED: 'Meta reklam kampanyası oluşturuldu (duraklatılmış)',
  META_ADSET_CREATED: 'Meta reklam seti oluşturuldu (duraklatılmış)',
  META_AD_CREATED: 'Meta reklamı oluşturuldu (duraklatılmış)',
  META_ENTITY_ACTIVATED: 'Meta reklamı yayına alındı',
  META_ENTITY_PAUSED: 'Meta reklamı duraklatıldı',
  NEWSLETTER_CONFIRMED: 'Bülten aboneliği onaylandı',
  NEWSLETTER_SUBSCRIBER_DELETED: 'Bülten abonesi silindi',
  // Kullanıcı / destek
  USER_ROLE_UPDATED: 'Kullanıcının yetkisi değiştirildi',
  USER_STATUS_UPDATED: 'Kullanıcı hesabının durumu değiştirildi',
  SUPPORT_TICKET_UPDATED: 'Destek talebi güncellendi',
  SUPPORT_TICKET_DELETED: 'Destek talebi silindi',
  // Pazaryeri / kargo
  'marketplace.store.created': 'Pazaryeri mağazası eklendi',
  'marketplace.store.updated': 'Pazaryeri mağazası güncellendi',
  'marketplace.store.deleted': 'Pazaryeri mağazası silindi',
  'marketplace.credentials.rotated': 'Pazaryeri erişim anahtarı yenilendi',
  'marketplace.connection.tested': 'Pazaryeri bağlantısı denendi',
  'marketplace.listings.refreshed': 'Pazaryeri ürünleri yenilendi',
  'marketplace.listings.imported': 'Pazaryeri ürünleri siteye aktarıldı',
  'marketplace.listings.pushed': 'Fiyat/stok pazaryerine gönderildi',
  'marketplace.listing.price_set': 'Pazaryeri ürün fiyatı değiştirildi',
  'marketplace.mapping.created': 'Pazaryeri ürünü bir ürünle eşleştirildi',
  'marketplace.mapping.deleted': 'Pazaryeri ürün eşleşmesi kaldırıldı',
  'marketplace.order.manual_sync': 'Pazaryeri siparişleri elle çekildi',
  'marketplace.order.mapping_applied': 'Pazaryeri siparişleri ürünlerle eşleştirildi',
  'shipping.shipment.created': 'Kargo kaydı oluşturuldu',
  'shipping.shipment.cancelled': 'Kargo iptal edildi',
  'shipping.tracking.updated': 'Kargo takip durumu güncellendi',
  'shipping.retry.triggered': 'Kargo işlemi yeniden denendi',
  'shipping.bulk.labels_generated': 'Toplu kargo etiketi oluşturuldu',
  'shipping.bulk.marked_as_shipped': 'Siparişler toplu olarak kargoya verildi',
  'shipping.webhook.processed': 'Kargo firmasından bildirim işlendi',
  'shipping.webhook.duplicate': 'Aynı kargo bildirimi tekrar geldi, yok sayıldı',
}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function humanizeCode(code: string): string {
  const words = code.replace(/[._]+/g, ' ').trim().toLowerCase()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Sistem hareketi'
}

/** What the action was about, in words: an order number, a product name, a coupon code; empty when unknown. */
export function auditSubject(row: AuditRow): string {
  const m = row.metadata ?? {}
  const order = text(m.orderNumber)
  if (order) return `Sipariş ${order}`
  return text(m.name) || text(m.materialName) || text(m.code)
}

/** Short extra detail worth showing beside the sentence. */
export function auditDetail(row: AuditRow): string {
  const m = row.metadata ?? {}
  switch (row.action) {
    case 'EMAIL_CAMPAIGN_SENT': {
      const sent = text(m.sent)
      const recipients = text(m.recipients)
      const failed = Number(m.failed ?? 0)
      if (!sent && !recipients) return ''
      return `${sent || '0'}/${recipients || sent} kişiye gitti${failed > 0 ? `, ${failed} hata` : ''}`
    }
    case 'ORDER_STATUS_CHANGED': {
      const from = text(m.fromStatus)
      const to = text(m.toStatus)
      return from && to ? `${from} → ${to}` : ''
    }
    case 'EMAIL_AUTOMATION_TOGGLED':
      return m.active === true ? 'açıldı' : m.active === false ? 'kapatıldı' : ''
    case 'PAYMENT_CREATED':
    case 'PAYMENT_PAID': {
      const amount = Number(m.amount)
      if (!Number.isFinite(amount) || amount <= 0) return ''
      return `${amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`
    }
    default:
      return ''
  }
}

/** One readable line, e.g. "Ödeme başlatıldı — Sipariş ZUU-123 (1.250,00 ₺)". */
export function describeAudit(row: AuditRow): string {
  const sentence = SENTENCES[row.action] ?? humanizeCode(row.action)
  const subject = auditSubject(row)
  const detail = auditDetail(row)
  let line = sentence
  if (subject) line += ` — ${subject}`
  if (detail) line += subject ? ` (${detail})` : ` — ${detail}`
  return line
}
