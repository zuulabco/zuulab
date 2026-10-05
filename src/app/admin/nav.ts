export interface NavItem {
  label: string
  href: string
  icon: string
  /** Other words the quick search finds this page by (Turkish letters optional) */
  keywords?: string
}

export interface NavSection {
  id: string
  /** No title: always shown, not collapsible */
  title?: string
  /** Collapsed until opened (rarely used groups) */
  collapsedByDefault?: boolean
  items: NavItem[]
}

/**
 * Admin navigation, grouped by the job being done. Labels say what the page is,
 * in sentence case; no decorative tags.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'general',
    items: [
      { label: 'Kontrol paneli', href: '/', icon: 'home', keywords: 'ana panel dashboard özet genel bakış' },
      { label: 'Bugün', href: '/today', icon: 'today', keywords: 'günlük yapılacaklar bekleyen işler today' },
    ],
  },
  {
    id: 'marketing',
    title: 'Pazarlama',
    items: [
      { label: 'Genel bakış', href: '/marketing', icon: 'megaphone', keywords: 'pazarlama özet ciro dönüşüm huni sepet terk ziyaretçi reklam roas marketing' },
      { label: 'Ürün performansı', href: '/marketing/products', icon: 'products', keywords: 'ürün analitik görüntülenme sepete ekleme satış dönüşüm en çok satan fırsat product' },
      { label: 'Müşteri grupları', href: '/marketing/segments', icon: 'customers', keywords: 'segment müşteri grubu kitle ilk alışveriş tekrar yüksek harcama sepet terk hedef kitle audience' },
      { label: 'Meta reklamları', href: '/marketing/meta', icon: 'megaphone', keywords: 'meta facebook instagram reklam kampanya reklam seti bütçe ads' },
      { label: 'Reklam raporu', href: '/marketing/meta/report', icon: 'analytics', keywords: 'meta reklam rapor harcama roas ctr cpc cpm erişim gösterim satın alma performans' },
      { label: 'E-posta', href: '/marketing/email', icon: 'mail', keywords: 'bülten kampanya e-posta resend gönderim abone açılma tıklama newsletter email' },
      { label: 'Analitik', href: '/analytics', icon: 'analytics', keywords: 'analizler google analytics rapor istatistik grafik analytics ziyaretçi tıklama' },
      { label: 'SEO', href: '/seo', icon: 'analytics', keywords: 'google arama search console sorgu tıklama gösterim sıralama seo' },
    ],
  },
  {
    id: 'sales',
    title: 'Satış',
    items: [
      { label: 'Siparişler', href: '/orders', icon: 'orders', keywords: 'order sipariş listesi' },
      { label: 'İadeler', href: '/returns', icon: 'returns', keywords: 'iade değişim rma return geri gönderim' },
      { label: 'Ödemeler', href: '/payments', icon: 'payments', keywords: 'ödeme tahsilat paytr havale eft kapıda payment' },
      { label: 'Kuponlar', href: '/coupons', icon: 'coupons', keywords: 'kupon indirim kodu coupon' },
      { label: 'Kampanyalar', href: '/campaigns', icon: 'megaphone', keywords: 'kampanya indirim promosyon fırsat' },
    ],
  },
  {
    id: 'catalog',
    title: 'Katalog',
    items: [
      { label: 'Ürünler', href: '/products', icon: 'products', keywords: 'ürün katalog product arşiv' },
      { label: 'Kategoriler', href: '/categories', icon: 'categories', keywords: 'kategori category' },
      { label: 'Koleksiyonlar', href: '/collections', icon: 'collections', keywords: 'koleksiyon collection seri' },
      { label: 'Yorumlar', href: '/reviews', icon: 'reviews', keywords: 'yorum değerlendirme puan review' },
    ],
  },
  {
    id: 'stock',
    title: 'Stok ve üretim',
    items: [
      { label: 'Envanter', href: '/inventory', icon: 'inventory', keywords: 'stok sayım envanter inventory' },
      { label: 'Malzemeler', href: '/inventory/materials', icon: 'swatch', keywords: 'malzeme bakım talimatı material' },
      { label: 'Üretim', href: '/production', icon: 'production', keywords: 'üretim emri baskı 3d yazıcı printer' },
      { label: 'Filament', href: '/materials', icon: 'filament', keywords: 'filament makara pla petg' },
    ],
  },
  {
    id: 'marketplaces',
    title: 'Pazaryerleri',
    items: [
      { label: 'Pazaryeri siparişleri', href: '/marketplaces/orders', icon: 'inbox', keywords: 'trendyol hepsiburada sipariş' },
      { label: 'Ürün eşleştirme', href: '/marketplaces/mappings', icon: 'link', keywords: 'trendyol eşleşme mapping listing' },
      { label: 'Mağazalar', href: '/marketplaces', icon: 'store', keywords: 'trendyol hepsiburada mağaza entegrasyon' },
    ],
  },
  {
    id: 'customers',
    title: 'Müşteriler',
    items: [
      { label: 'Müşteriler', href: '/customers', icon: 'customers', keywords: 'müşteri customer üye' },
      { label: 'Destek talepleri', href: '/support', icon: 'support', keywords: 'destek ticket mesaj iletişim formu' },
    ],
  },
  {
    id: 'fulfilment',
    title: 'Kargo ve fatura',
    items: [
      { label: 'Kargo', href: '/shipping', icon: 'shipping', keywords: 'kargo gönderi takip sürat ptt geliver shipping' },
      { label: 'e-Faturalar', href: '/invoices', icon: 'invoices', keywords: 'fatura e-arşiv efatura invoice' },
    ],
  },
  {
    id: 'content',
    title: 'Vitrin',
    collapsedByDefault: true,
    items: [
      { label: 'Ana sayfa', href: '/content/homepage', icon: 'layout', keywords: 'vitrin slider banner hero anasayfa' },
      { label: 'Duyuru bandı', href: '/content/announcement', icon: 'announcement', keywords: 'duyuru announcement üst bant' },
      { label: 'Sosyal medya', href: '/content/social', icon: 'share', keywords: 'instagram tiktok sosyal' },
      { label: 'Bülten', href: '/content/newsletter', icon: 'mail', keywords: 'bülten newsletter abone e-posta' },
      { label: 'Medya', href: '/content/media', icon: 'media', keywords: 'görsel fotoğraf resim medya kütüphanesi' },
    ],
  },
  {
    id: 'system',
    title: 'Sistem',
    collapsedByDefault: true,
    items: [
      { label: 'Kullanıcılar ve roller', href: '/users', icon: 'users', keywords: 'kullanıcı yetki rol admin personel' },
      { label: 'Bildirimler', href: '/notifications', icon: 'notifications', keywords: 'bildirim e-posta sms notification' },
      { label: 'Ayarlar', href: '/settings', icon: 'settings', keywords: 'ayar settings mağaza bilgileri' },
    ],
  },
]

/** Things to do rather than pages to open; found by the quick search only. */
export const QUICK_ACTIONS: NavItem[] = [
  { label: 'Yeni ürün ekle', href: '/products/new', icon: 'products', keywords: 'ürün ekle oluştur yeni' },
  { label: 'Yeni üretim emri', href: '/production/new', icon: 'production', keywords: 'üretim ekle oluştur yeni baskı' },
]
