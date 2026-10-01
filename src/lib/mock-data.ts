export interface MockProduct {
  id: string
  name: string
  slug: string
  category?: string
  description: string
  shortDescription: string
  categoryId: string
  categoryName: string
  categorySlug: string
  /** Brand collection memberships (a product can belong to multiple collections) */
  collections?: string[]
  /** Brand collection world: zuukids | zuulife | zuutoptan | zuulight | general (for backward compatibility) */
  collectionWorld?: 'zuukids' | 'zuulife' | 'zuutoptan' | 'zuulight' | 'general'
  sku: string
  price: number
  oldPrice?: number
  cost?: number
  taxRate: number
  weight: number
  material: string
  productionTime: string
  /** Available color slugs for this product */
  colors?: string[]
  isFeatured: boolean
  isBestSeller?: boolean
  isNew: boolean
  isActive: boolean
  stock: number
  rating: number
  reviewCount: number
  images: Array<{ url: string; alt: string; isPrimary: boolean }>
  variants?: Array<{
    id: string
    name: string
    value: string
    price?: number
    stock: number
    sku: string
  }>
  specifications: Array<{ name: string; value: string }>
}

export type Product = MockProduct

export interface MockCategory {
  id: string
  name: string
  slug: string
  description: string
  image: string
  productCount: number
  sortOrder?: number
  featured?: boolean
  collectionLabel?: string
  collectionWorld?: string
}

export const MOCK_CATEGORIES: MockCategory[] = [
  {
    id: 'cat-aydinlatmalar',
    name: 'Aydınlatmalar',
    slug: 'aydinlatmalar',
    description: 'Lithophane ışık tabloları, parametrik abajurlar ve ambiyans lambaları.',
    image: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=800&q=80',
    productCount: 3,
    sortOrder: 1,
  },
  {
    id: 'cat-figurler',
    name: 'Figürler',
    slug: 'figurler',
    description: '3D baskı karakter, heykel ve koleksiyonluk figür tasarımları.',
    image: 'https://images.unsplash.com/photo-1587654780291-39c9404d746b?auto=format&fit=crop&w=800&q=80',
    productCount: 2,
    sortOrder: 2,
  },
  {
    id: 'cat-oyun-eglence',
    name: 'Oyun ve Eğlence',
    slug: 'oyun-eglence',
    description: 'Strateji oyunları, montessori eğitim materyalleri ve interaktif oyuncaklar.',
    image: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=800&q=80',
    productCount: 3,
    sortOrder: 3,
  },
  {
    id: 'cat-masaustu-organizer',
    name: 'Masaüstü & Organizer',
    slug: 'masaustu-organizer',
    description: 'Kulaklık standları, kablo düzenleyiciler ve modüler masaüstü organizerlar.',
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80',
    productCount: 5,
    sortOrder: 4,
  },
  {
    id: 'cat-saksi-dekorasyon',
    name: 'Saksı & Dekorasyon',
    slug: 'saksi-dekorasyon',
    description: 'Parametrik vazolar, geometrik saksılar ve modern ev dekorasyon objeleri.',
    image: 'https://images.unsplash.com/photo-1581783342308-f792dbdd27c5?auto=format&fit=crop&w=800&q=80',
    productCount: 1,
    sortOrder: 5,
  },
  {
    id: 'cat-ev-yasam',
    name: 'Ev & Yaşam',
    slug: 'ev-yasam',
    description: 'Yaşam alanlarına değer katan fonksiyonel ve estetik tasarım objeleri.',
    image: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=800&q=80',
    productCount: 0,
    sortOrder: 6,
  },
  {
    id: 'cat-anahtarliklar',
    name: 'Anahtarlıklar',
    slug: 'anahtarliklar',
    description: 'Kişiselleştirilebilir ve tematik 3D baskı anahtarlık tasarımları.',
    image: 'https://images.unsplash.com/photo-1588508065123-287b28e013da?auto=format&fit=crop&w=800&q=80',
    productCount: 0,
    sortOrder: 7,
  },
  {
    id: 'cat-kitap-ayraci',
    name: 'Kitap Ayracı',
    slug: 'kitap-ayraci',
    description: 'Minimalist ve yaratıcı 3D baskı kitap ayraçları.',
    image: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=800&q=80',
    productCount: 0,
    sortOrder: 8,
  },
  {
    id: 'cat-aksesuarlar',
    name: 'Aksesuarlar',
    slug: 'aksesuarlar',
    description: 'Giyilebilir ve taşınabilir modern tasarım aksesuarları.',
    image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80',
    productCount: 0,
    sortOrder: 9,
  },
  {
    id: 'cat-hediyelik',
    name: 'Hediyelik',
    slug: 'hediyelik',
    description: 'Özel günler ve kurumsal tebrikler için özgün tasarım hediyeler.',
    image: 'https://images.unsplash.com/photo-1513885535751-8b9238bd345a?auto=format&fit=crop&w=800&q=80',
    productCount: 1,
    sortOrder: 10,
  },
  {
    id: 'cat-ozel-tasarim',
    name: 'Özel Tasarım / Diğer',
    slug: 'ozel-tasarim',
    description: 'Kişiye ve kuruma özel butik 3D üretimler ve prototipler.',
    image: 'https://images.unsplash.com/photo-1554188248-986adbb73be4?auto=format&fit=crop&w=800&q=80',
    productCount: 0,
    sortOrder: 11,
  },
]

export const MOCK_PRODUCTS: MockProduct[] = [
  // ── ZuuKids ──────────────────────────────────────────────
  {
    id: 'prod-zk1',
    name: 'Mini Dinozor Serisi (6 Figür Set)',
    slug: 'mini-dinozor-serisi-set',
    description: 'Çocukların hayal dünyasını besleyen, yumuşak yüzeyli 6 adet mini dinozor figür seti. T-Rex, Triceratops, Brontosaurus, Stegosaurus, Velociraptor ve Pterodactyl dahil. Çocuklar için güvenli PLA malzemeden üretilmiştir, keskin kenar yoktur.',
    shortDescription: '6 figürlü yumuşak yüzeyli çocuk güvenli mini dinozor seti.',
    categoryId: 'cat-figurler',
    categoryName: 'Figürler',
    categorySlug: 'figurler',
    collections: ['zuukids'],
    collectionWorld: 'zuukids',
    colors: ['sari', 'yesil', 'mavi', 'kirmizi'],
    sku: 'ZUU-KD-001',
    price: 279.0,
    oldPrice: 349.0,
    taxRate: 20,
    weight: 180,
    material: 'Yumuşak Yüzeyli Çocuk Güvenli PLA',
    productionTime: '1-2 iş günü',
    isFeatured: true,
    isBestSeller: true,
    isNew: true,
    isActive: true,
    stock: 48,
    rating: 5.0,
    reviewCount: 87,
    images: [
      {
        url: 'https://images.unsplash.com/photo-1587654780291-39c9404d746b?auto=format&fit=crop&w=1000&q=80',
        alt: 'Mini Dinozor Serisi — 6 Figür',
        isPrimary: true,
      },
    ],
    variants: [
      { id: 'vk1', name: 'Renk', value: 'Canlı Renkler (6 Farklı)', stock: 30, sku: 'ZUU-KD-001-R' },
      { id: 'vk2', name: 'Renk', value: 'Doğal (PLA Krem)', stock: 18, sku: 'ZUU-KD-001-K' },
    ],
    specifications: [
      { name: 'Figür Sayısı', value: '6 Adet' },
      { name: 'Boy', value: '6–9 cm Arası' },
      { name: 'Güvenlik', value: 'CE Uyumlu, Çocuk Güvenli PLA' },
      { name: 'Yaş Aralığı', value: '3+ Yaş' },
    ],
  },
  {
    id: 'prod-zk2',
    name: 'Eğitim Geometri Seti — Montessori',
    slug: 'egitim-geometri-seti-montessori',
    description: 'Montessori ilkelerine göre tasarlanmış, çocukların 3D geometrik şekilleri dokunarak öğrenmelerini sağlayan 10 parçalı set. Küp, silindir, koni, küre dahil. Renk kodlamalı ve kelime kartları dahil.',
    shortDescription: '10 parçalı Montessori uyumlu 3D geometri öğrenme seti.',
    categoryId: 'cat-oyun-eglence',
    categoryName: 'Oyun ve Eğlence',
    categorySlug: 'oyun-eglence',
    collections: ['zuukids'],
    collectionWorld: 'zuukids',
    colors: ['sari', 'mavi', 'kirmizi', 'yesil'],
    sku: 'ZUU-KD-002',
    price: 349.0,
    taxRate: 20,
    weight: 240,
    material: 'Renk Güvenli PLA+ Biyopolimer',
    productionTime: '1-2 iş günü',
    isFeatured: false,
    isBestSeller: false,
    isNew: true,
    isActive: true,
    stock: 32,
    rating: 4.9,
    reviewCount: 44,
    images: [
      {
        url: 'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?auto=format&fit=crop&w=1000&q=80',
        alt: 'Montessori Geometri Seti',
        isPrimary: true,
      },
    ],
    specifications: [
      { name: 'Parça Sayısı', value: '10 Adet' },
      { name: 'Yaş', value: '2–8 Yaş' },
      { name: 'Malzeme', value: 'Renk Güvenli PLA+ — Ftalat ve BPA İçermez' },
    ],
  },

  // ── ZuuLife ───────────────────────────────────────────────
  {
    id: 'prod-1',
    name: 'Vortex Geometrik Kulaklık Standı',
    slug: 'vortex-geometrik-kulaklik-standi',
    description: 'Vortex Kulaklık Standı, parametrik dalga formlarından ilham alınarak tasarlanmıştır. Ağırlık merkezi özel olarak dengelenmiş tabanı sayesinde tüm kafa üstü kulaklık modellerini devrilmeden güvenle taşır. Yüksek yoğunluklu biyo-bozunur PLA+ malzemeden katman hassasiyeti 0.12mm olacak şekilde ultra detaylı üretilmiştir.',
    shortDescription: 'Parametrik dalga formlu, dengeli tabana sahip premium kulaklık standı.',
    categoryId: 'cat-masaustu-organizer',
    categoryName: 'Masaüstü & Organizer',
    categorySlug: 'masaustu-organizer',
    collections: ['zuulife'],
    collectionWorld: 'zuulife',
    colors: ['antrasit', 'beyaz', 'turuncu'],
    sku: 'ZUU-VOR-001',
    price: 389.0,
    oldPrice: 489.0,
    taxRate: 20,
    weight: 280,
    material: 'Premium PLA+ Biyo-Polimer',
    productionTime: '1-2 iş günü',
    isFeatured: true,
    isBestSeller: false,
    isNew: true,
    isActive: true,
    stock: 24,
    rating: 4.9,
    reviewCount: 38,
    images: [
      {
        url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1000&q=80',
        alt: 'Vortex Kulaklık Standı Siyah',
        isPrimary: true,
      },
      {
        url: 'https://images.unsplash.com/photo-1484704849700-f032a568e944?auto=format&fit=crop&w=1000&q=80',
        alt: 'Vortex Kulaklık Standı Açılı Görünüm',
        isPrimary: false,
      },
    ],
    variants: [
      { id: 'v-1', name: 'Renk', value: 'Mat Antrasit', stock: 12, sku: 'ZUU-VOR-BLK' },
      { id: 'v-2', name: 'Renk', value: 'Mermer Beyaz', stock: 8, sku: 'ZUU-VOR-WHT' },
      { id: 'v-3', name: 'Renk', value: 'Terracotta Turuncu', stock: 4, sku: 'ZUU-VOR-ORG' },
    ],
    specifications: [
      { name: 'Boyutlar', value: '260 x 140 x 120 mm' },
      { name: 'Ağırlık', value: '280 gram' },
      { name: 'Baskı Teknolojisi', value: 'FDM Ultra-Fine (0.12mm)' },
      { name: 'Malzeme', value: 'Yüksek Mukavemetli PLA+' },
      { name: 'Taban Koruma', value: 'Kaydırmaz Silikon Pedler Dahil' },
    ],
  },
  {
    id: 'prod-2',
    name: 'Aura Parametrik Vazo (Spiral Seri)',
    slug: 'aura-parametrik-vazo-spiral',
    description: 'Aura Spiral Vazo, matematiksel altın oran formülleri kullanılarak parametrik modelleme ile oluşturulmuştur. Su geçirmez iç kaplama işleminden geçirilmiş olup hem kuru çiçekler hem de canlı çiçek aranjmanları için uygundur.',
    shortDescription: 'Altın oran spiral formlu, su sızdırmaz modern dekoratif vazo.',
    categoryId: 'cat-saksi-dekorasyon',
    categoryName: 'Saksı & Dekorasyon',
    categorySlug: 'saksi-dekorasyon',
    collections: ['zuulife'],
    collectionWorld: 'zuulife',
    colors: ['krem', 'beyaz', 'siyah'],
    sku: 'ZUU-AUR-002',
    price: 449.0,
    oldPrice: 550.0,
    taxRate: 20,
    weight: 340,
    material: 'Mat PLA+ & PETG İç Katman',
    productionTime: '2-3 iş günü',
    isFeatured: true,
    isBestSeller: false,
    isNew: false,
    isActive: true,
    stock: 16,
    rating: 4.8,
    reviewCount: 24,
    images: [
      {
        url: 'https://images.unsplash.com/photo-1581783342308-f792dbdd27c5?auto=format&fit=crop&w=1000&q=80',
        alt: 'Aura Parametrik Vazo Krem',
        isPrimary: true,
      },
    ],
    variants: [
      { id: 'v-4', name: 'Boyut', value: 'Standart (22 cm)', price: 449.0, stock: 10, sku: 'ZUU-AUR-STD' },
      { id: 'v-5', name: 'Boyut', value: 'Büyük (28 cm)', price: 589.0, stock: 6, sku: 'ZUU-AUR-LRG' },
    ],
    specifications: [
      { name: 'Yükseklik', value: '22 cm / 28 cm' },
      { name: 'Su Geçirmezlik', value: 'Çift Katmanlı İç Yüzey' },
    ],
  },
  {
    id: 'prod-3',
    name: 'Modular Hex Desk Organizer Seti (5 Parça)',
    slug: 'modular-hex-desk-organizer-seti',
    description: 'Neodimyum mıknatıslarla birbirine kenetlenen 5 parçalı modüler altıgen masa düzenleyici. Kalemlik, ataç kutusu, kablosuz şarj yuvası, telefon standı ve kartvizitlik modüllerini dilediğiniz kombinasyonda birleştirebilirsiniz.',
    shortDescription: 'Mıknatıslı kenetleme sistemine sahip 5 parçalı modüler masa düzenleyici.',
    categoryId: 'cat-masaustu-organizer',
    categoryName: 'Masaüstü & Organizer',
    categorySlug: 'masaustu-organizer',
    collections: ['zuulife'],
    collectionWorld: 'zuulife',
    colors: ['siyah', 'yesil'],
    sku: 'ZUU-HEX-003',
    price: 529.0,
    oldPrice: 680.0,
    taxRate: 20,
    weight: 420,
    material: 'Mat PLA + N52 Neodimyum Mıknatıslar',
    productionTime: '1-2 iş günü',
    isFeatured: true,
    isBestSeller: false,
    isNew: true,
    isActive: true,
    stock: 30,
    rating: 5.0,
    reviewCount: 42,
    images: [
      {
        url: 'https://images.unsplash.com/photo-1593062096033-9a26b09da705?auto=format&fit=crop&w=1000&q=80',
        alt: 'Modular Hex Organizer Seti',
        isPrimary: true,
      },
    ],
    variants: [
      { id: 'v-6', name: 'Renk', value: 'Koyu Gri / Siyah', stock: 15, sku: 'ZUU-HEX-DGY' },
      { id: 'v-7', name: 'Renk', value: 'Adaçayı Yeşili', stock: 10, sku: 'ZUU-HEX-GRN' },
    ],
    specifications: [
      { name: 'Modül Sayısı', value: '5 Adet' },
      { name: 'Mıknatıs', value: 'Her Köşede N52 Neodimyum' },
    ],
  },
  {
    id: 'prod-4',
    name: 'LithoGlow Ay Yüzeyi Gece Lambası (USB-C)',
    slug: 'lithoglow-ay-yuzeyi-gece-lambasi',
    description: 'NASA topoğrafik ay haritası verileri baz alınarak 0.08mm mikro katman hassasiyetiyle üretilmiş Lithophane küre lamba. Kademesiz dokunmatik parlaklık ayarı, 12 saate kadar kablosuz kullanım.',
    shortDescription: 'NASA verileriyle üretilmiş dokunmatik ve şarjlı 3D ay lambası.',
    categoryId: 'cat-aydinlatmalar',
    categoryName: 'Aydınlatmalar',
    categorySlug: 'aydinlatmalar',
    collections: ['zuulight'],
    collectionWorld: 'zuulight',
    colors: ['beyaz', 'seffaf'],
    sku: 'ZUU-LIT-004',
    price: 649.0,
    oldPrice: 799.0,
    taxRate: 20,
    weight: 310,
    material: 'Optik Sınıf PETG + Doğal Ahşap Stand',
    productionTime: '2-4 iş günü',
    isFeatured: true,
    isBestSeller: false,
    isNew: true,
    isActive: true,
    stock: 18,
    rating: 4.9,
    reviewCount: 56,
    images: [
      {
        url: 'https://images.unsplash.com/photo-1532767153582-b1a0e5145009?auto=format&fit=crop&w=1000&q=80',
        alt: 'LithoGlow Gece Lambası',
        isPrimary: true,
      },
      {
        url: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1000&q=80',
        alt: 'LithoGlow Ay Lambası Karanlıkta',
        isPrimary: false,
      },
    ],
    variants: [
      { id: 'v-9', name: 'Çap', value: '15 cm', price: 649.0, stock: 12, sku: 'ZUU-LIT-15' },
      { id: 'v-10', name: 'Çap', value: '20 cm', price: 849.0, stock: 6, sku: 'ZUU-LIT-20' },
    ],
    specifications: [
      { name: 'Işık Rengi', value: '3000K Sıcak / 4500K Doğal Beyaz' },
      { name: 'Pil', value: '1200 mAh (8-12 Saat)' },
    ],
  },
  {
    id: 'prod-5',
    name: 'Kyoto Düşünen İnsan Heykeli',
    slug: 'kyoto-dusunen-insan-heykeli',
    description: 'Japon Wabi-Sabi estetiğinden ilham alan tek çizgi silüetli modern soyut heykel.',
    shortDescription: 'Tek parça soyut silüet formlu modern salon heykeli.',
    categoryId: 'cat-figurler',
    categoryName: 'Figürler',
    categorySlug: 'figurler',
    collections: ['koleksiyonlar'],
    collectionWorld: 'general',
    colors: ['siyah', 'gri'],
    sku: 'ZUU-KYO-005',
    price: 320.0,
    oldPrice: 390.0,
    taxRate: 20,
    weight: 210,
    material: 'Mat Taş Dokulu PLA',
    productionTime: '1-2 iş günü',
    isFeatured: false,
    isBestSeller: false,
    isNew: true,
    isActive: true,
    stock: 22,
    rating: 4.7,
    reviewCount: 19,
    images: [
      {
        url: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=1000&q=80',
        alt: 'Kyoto Heykeli',
        isPrimary: true,
      },
    ],
    specifications: [
      { name: 'Boyut', value: '200 x 95 x 75 mm' },
      { name: 'Yüzey', value: 'Mat Kumlanmış Taş Efekti' },
    ],
  },
  {
    id: 'prod-6',
    name: 'CableFlow Manyetik Kablo Düzenleyici Bar',
    slug: 'cableflow-manyetik-kablo-duzenleyici-bar',
    description: 'Masa kenarına 3M VHB bantla sabitlenen mıknatıslı kablo tutucu kiti. 4 kablo yakası + 1 ana bar.',
    shortDescription: '4 yuvalı manyetik kablo düzenleyici bar seti.',
    categoryId: 'cat-masaustu-organizer',
    categoryName: 'Masaüstü & Organizer',
    categorySlug: 'masaustu-organizer',
    collections: ['zuulife'],
    collectionWorld: 'zuulife',
    colors: ['siyah', 'beyaz'],
    sku: 'ZUU-CAB-006',
    price: 199.0,
    oldPrice: 249.0,
    taxRate: 20,
    weight: 90,
    material: 'PETG + N52 Mıknatıs + 3M VHB',
    productionTime: '1 iş günü',
    isFeatured: false,
    isBestSeller: false,
    isNew: false,
    isActive: true,
    stock: 45,
    rating: 4.9,
    reviewCount: 67,
    images: [
      {
        url: 'https://images.unsplash.com/photo-1588508065123-287b28e013da?auto=format&fit=crop&w=1000&q=80',
        alt: 'CableFlow Manyetik Kablo Düzenleyici',
        isPrimary: true,
      },
    ],
    variants: [
      { id: 'v-11', name: 'Renk', value: 'Mat Siyah', stock: 25, sku: 'ZUU-CAB-BLK' },
      { id: 'v-12', name: 'Renk', value: 'Kutup Beyazı', stock: 20, sku: 'ZUU-CAB-WHT' },
    ],
    specifications: [
      { name: 'Uyumluluk', value: 'USB-C, Lightning, HDMI (Max 6mm)' },
      { name: 'Montaj', value: '3M VHB Çift Taraflı Bant' },
    ],
  },

  // ── ZuuKids Extended ─────────────────────────────────────
  {
    id: 'prod-zk3',
    name: 'Denge Panda Aile Strateji Oyunu',
    slug: 'denge-panda-aile-strateji-oyunu',
    description: '18 adet istiflenebilir sevimli panda figürü ve dalgalı denge platformundan oluşan aile kutu oyunu. Çocukların el-göz koordinasyonunu ve ince motor becerilerini geliştirir. Gıda temasına uygun, ftalat ve BPA içermeyen biyo-PLA ile üretilmiştir.',
    shortDescription: '18 panda figürlü el-göz koordinasyonu ve denge oyunu.',
    categoryId: 'cat-oyun-eglence',
    categoryName: 'Oyun ve Eğlence',
    categorySlug: 'oyun-eglence',
    collections: ['zuukids'],
    collectionWorld: 'zuukids',
    colors: ['krem', 'siyah', 'sari'],
    sku: 'ZUU-KD-003',
    price: 299.0,
    oldPrice: 380.0,
    taxRate: 20,
    weight: 220,
    material: 'Biyo-Çözünür Doğal PLA',
    productionTime: '1-2 iş günü',
    isFeatured: true,
    isBestSeller: false,
    isNew: true,
    isActive: true,
    stock: 35,
    rating: 4.9,
    reviewCount: 29,
    images: [
      {
        url: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=1000&q=80',
        alt: 'Denge Panda Aile Oyunu',
        isPrimary: true,
      },
    ],
    specifications: [
      { name: 'Parça Sayısı', value: '18 Panda + 1 Denge Tabanı' },
      { name: 'Yaş', value: '3+ Yaş' },
      { name: 'Güvenlik', value: 'CE Uyumlu Yuvarlatılmış Kenarlar' },
    ],
  },
  {
    id: 'prod-zk4',
    name: 'DuyuLab Dokunma & Geometrik Eşleme Küpü',
    slug: 'duyulab-dokunma-ve-sekil-esleme-kupu',
    description: 'Montessori duyusal eğitim prensipleriyle tasarlanmış, farklı yüzey dokularına (çizgili, noktalı, spiral, dalgalı) sahip 8 parça geometrik blok ve ana eşleme kasası.',
    shortDescription: '8 parçalı dokunsal algı ve geometrik eşleme küpü.',
    categoryId: 'cat-oyun-eglence',
    categoryName: 'Oyun ve Eğlence',
    categorySlug: 'oyun-eglence',
    collections: ['zuukids'],
    collectionWorld: 'zuukids',
    colors: ['krem', 'mavi', 'pembe'],
    sku: 'ZUU-KD-004',
    price: 329.0,
    taxRate: 20,
    weight: 260,
    material: 'Gıda Uyumlu Biyo-Polimer PLA',
    productionTime: '1-2 iş günü',
    isFeatured: false,
    isBestSeller: false,
    isNew: true,
    isActive: true,
    stock: 28,
    rating: 4.8,
    reviewCount: 16,
    images: [
      {
        url: 'https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?auto=format&fit=crop&w=1000&q=80',
        alt: 'DuyuLab Dokunma Küpü',
        isPrimary: true,
      },
    ],
    specifications: [
      { name: 'Gelişim Alanı', value: 'İnce Motor ve Dokunsal Algı' },
      { name: 'Malzeme', value: 'Doğal PLA+ Mısır Nişastası Polimeri' },
    ],
  },

  // ── ZuuLight Extended ────────────────────────────────────
  {
    id: 'prod-lit2',
    name: 'Parametrik Hive Ambiyans Masa Lambası',
    slug: 'parametrik-hive-ambiyans-masa-lambasi',
    description: 'Petek hücresi formundaki parametrik kafes geometrisiyle ışığı yumuşatarak mekana dramatik gölgeler yansıtan masa lambası. 3000K sıcak ışık yayan entegre filament LED teknolojisi.',
    shortDescription: 'Parametrik petek kafes formlu sıcak ambiyans lambası.',
    categoryId: 'cat-aydinlatmalar',
    categoryName: 'Aydınlatmalar',
    categorySlug: 'aydinlatmalar',
    collections: ['zuulight'],
    collectionWorld: 'zuulight',
    colors: ['seffaf', 'amber'],
    sku: 'ZUU-LIT-002',
    price: 549.0,
    oldPrice: 680.0,
    taxRate: 20,
    weight: 380,
    material: 'Yarı Saydam PETG + Doğal Masif Meşe Taban',
    productionTime: '2-3 iş günü',
    isFeatured: true,
    isBestSeller: false,
    isNew: true,
    isActive: true,
    stock: 20,
    rating: 4.9,
    reviewCount: 31,
    images: [
      {
        url: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1000&q=80',
        alt: 'Parametrik Hive Ambiyans Lambası',
        isPrimary: true,
      },
    ],
    specifications: [
      { name: 'Işık Rengi', value: '3000K Amber Sıcak' },
      { name: 'Kablo', value: '1.8m Örgü Kumaş Kablo & Ara Puar' },
    ],
  },
  {
    id: 'prod-lit3',
    name: 'Eclipse Ay Tutulması Duvar Apliği',
    slug: 'eclipse-ay-tutulmasi-duvar-apligi',
    description: 'Ay tutulmasının korona halkasından ilham alan dolaylı aydınlatma duvar apliği. Işığı duvara yansıtarak göz kamaştırmayan heykelsi bir derinlik oluşturur.',
    shortDescription: 'Dolaylı ışık yayan mimari tutulma formlu duvar apliği.',
    categoryId: 'cat-aydinlatmalar',
    categoryName: 'Aydınlatmalar',
    categorySlug: 'aydinlatmalar',
    collections: ['zuulight'],
    collectionWorld: 'zuulight',
    colors: ['siyah', 'antrasit'],
    sku: 'ZUU-LIT-003',
    price: 790.0,
    oldPrice: 940.0,
    taxRate: 20,
    weight: 460,
    material: 'Mat Siyah PETG + Alüminyum Soğutucu',
    productionTime: '2-4 iş günü',
    isFeatured: false,
    isBestSeller: false,
    isNew: true,
    isActive: true,
    stock: 12,
    rating: 4.8,
    reviewCount: 18,
    images: [
      {
        url: 'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&w=1000&q=80',
        alt: 'Eclipse Duvar Apliği',
        isPrimary: true,
      },
    ],
    specifications: [
      { name: 'Montaj', value: 'Manyetik Duvar Braketi' },
      { name: 'Işık Akısı', value: '650 Lümen, Kısılabilir' },
    ],
  },

  // ── ZuuToptan ─────────────────────────────────────────────
  {
    id: 'prod-top1',
    name: 'Özel Logolu Masaüstü Kartvizit & Telefon Standı (Toptan 25+)',
    slug: 'ozel-logolu-masaustu-stand-toptan',
    description: 'İşletmenizin kurumsal logosu ve renk paletine özel olarak üretilen minimalist telefon ve kartvizit standı. Butikler, oteller, diş klinikleri, mimarlık ofisleri ve etkinlikler için ideal kurumsal prestij hediyesi. Minimum sipariş: 25 Adet.',
    shortDescription: 'Kurumsal logolu ve özel renkli toptan masaüstü standı (min 25 adet).',
    categoryId: 'cat-masaustu-organizer',
    categoryName: 'Masaüstü & Organizer',
    categorySlug: 'masaustu-organizer',
    collections: ['zuutoptan'],
    collectionWorld: 'zuutoptan',
    colors: ['beyaz', 'siyah', 'gri'],
    sku: 'ZUU-TOP-001',
    price: 95.0,
    oldPrice: 130.0,
    taxRate: 20,
    weight: 120,
    material: 'Endüstriyel Mukavemetli PLA+',
    productionTime: '3-5 iş günü',
    isFeatured: true,
    isBestSeller: true,
    isNew: true,
    isActive: true,
    stock: 500,
    rating: 5.0,
    reviewCount: 41,
    images: [
      {
        url: 'https://images.unsplash.com/photo-1554188248-986adbb73be4?auto=format&fit=crop&w=1000&q=80',
        alt: 'Özel Logolu Masaüstü Stand Toptan',
        isPrimary: true,
      },
    ],
    variants: [
      { id: 'vt-1', name: 'Paket Adedi', value: '25 Adet (Birim 95 ₺)', price: 95.0, stock: 300, sku: 'ZUU-TOP-25' },
      { id: 'vt-2', name: 'Paket Adedi', value: '50 Adet (Birim 85 ₺)', price: 85.0, stock: 200, sku: 'ZUU-TOP-50' },
      { id: 'vt-3', name: 'Paket Adedi', value: '100+ Adet (Birim 75 ₺)', price: 75.0, stock: 150, sku: 'ZUU-TOP-100' },
    ],
    specifications: [
      { name: 'Minimum Sipariş (MOQ)', value: '25 Adet' },
      { name: 'Özelleştirme', value: 'Gömme / Kabartma 3D Vektörel Logo' },
      { name: 'Renk Seçenekleri', value: 'Pantone Kurumsal Renk Eşleme' },
      { name: 'Ambalaj', value: 'Tekli Kraft Kutu veya Toplu Koli' },
    ],
  },
  {
    id: 'prod-top2',
    name: 'Akrilik & PLA Kafe QR Menü Blokları (20\'li Paket)',
    slug: 'kafe-qr-menu-bloklari-paket',
    description: 'Kafe, bar ve restoranlar için masaya sabitlenen veya taşınabilir 20 adet akıllı QR menü ve masa numarası bloğu. Kolay temizlenir, düşmelere ve sıvı temasına dayanıklıdır.',
    shortDescription: 'Restoran ve kafeler için 20 adet dayanıklı QR menü bloğu paketi.',
    categoryId: 'cat-masaustu-organizer',
    categoryName: 'Masaüstü & Organizer',
    categorySlug: 'masaustu-organizer',
    collections: ['zuutoptan'],
    collectionWorld: 'zuutoptan',
    colors: ['siyah', 'gri'],
    sku: 'ZUU-TOP-002',
    price: 680.0,
    oldPrice: 850.0,
    taxRate: 20,
    weight: 480,
    material: 'Yüksek Yoğunluklu PETG',
    productionTime: '2-4 iş günü',
    isFeatured: true,
    isBestSeller: false,
    isNew: true,
    isActive: true,
    stock: 120,
    rating: 4.9,
    reviewCount: 22,
    images: [
      {
        url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1000&q=80',
        alt: 'Kafe QR Menü Blokları Toptan',
        isPrimary: true,
      },
    ],
    specifications: [
      { name: 'Paket İçeriği', value: '20 Adet Çift Yönlü QR Blok' },
      { name: 'Temizlik', value: 'Alkol ve Dezenfektana Dayanıklı' },
      { name: 'Kişiselleştirme', value: 'Masa No + Masaüstü QR Kod Dahil' },
    ],
  },
  {
    id: 'prod-top3',
    name: 'Geometrik Kurumsal Masaüstü Hediye Kiti',
    slug: 'geometrik-kurumsal-masaustu-hediye-kiti',
    description: 'Yılbaşı, etkinlik veya çalışan hoş geldin paketi için özel tasarlanmış kartvizitlik, kablo tutucu ve geometrik ataçlık içeren 3 parçalı hediye kutusu.',
    shortDescription: 'Çalışan ve müşteri hediyesi için 3 parçalı premium kurumsal kit.',
    categoryId: 'cat-hediyelik',
    categoryName: 'Hediyelik',
    categorySlug: 'hediyelik',
    collections: ['zuutoptan', 'zuulife'],
    collectionWorld: 'zuutoptan',
    colors: ['krem', 'siyah'],
    sku: 'ZUU-TOP-003',
    price: 240.0,
    oldPrice: 290.0,
    taxRate: 20,
    weight: 320,
    material: 'Mat Kumlanmış PLA+ & Kraft Kutu',
    productionTime: '3-5 iş günü',
    isFeatured: false,
    isBestSeller: false,
    isNew: true,
    isActive: true,
    stock: 250,
    rating: 4.8,
    reviewCount: 15,
    images: [
      {
        url: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=1000&q=80',
        alt: 'Kurumsal Hediye Kiti Toptan',
        isPrimary: true,
      },
    ],
    specifications: [
      { name: 'Minimum Sipariş', value: '15 Kutu' },
      { name: 'Kutu Baskısı', value: 'Özel Kurumsal Kılıf / Sticker' },
    ],
  },
]

export const MOCK_REVIEWS = [
  {
    id: 'rev-1',
    productId: 'prod-1',
    author: 'Kaan A.',
    rating: 5,
    date: '14 Mart 2026',
    title: 'Baskı kalitesi inanılmaz pürüzsüz',
    body: 'Daha önce aldığım 3D baskılarda katman çizgileri çok belli olurdu ama Zuulab gerçekten endüstriyel kalitede üretmiş.',
    verified: true,
  },
  {
    id: 'rev-2',
    productId: 'prod-1',
    author: 'Selin Y.',
    rating: 5,
    date: '2 Mart 2026',
    title: 'Harika tasarım ve hızlı kargo',
    body: 'Siparişim ertesi gün kargoya verildi. Mermer beyaz rengi tam istediğim gibi.',
    verified: true,
  },
  {
    id: 'rev-3',
    productId: 'prod-zk1',
    author: 'Ayşe K.',
    rating: 5,
    date: '20 Mart 2026',
    title: 'Çocuğum çok sevdi!',
    body: 'Oğlum 4 yaşında, her geçen gün dinozorlarıyla oynuyor. Renkleri canlı, kenarları yumuşak, keskin hiçbir yer yok. Teşekkürler Zuulab!',
    verified: true,
  },
  {
    id: 'rev-4',
    productId: 'prod-3',
    author: 'Ece B.',
    rating: 5,
    date: '20 Şubat 2026',
    title: 'Mıknatıslar çok güçlü',
    body: 'Masaüstümdeki dağınıklığı tamamen çözdü.',
    verified: true,
  },
]

/** Best-seller products, prioritizing isBestSeller flag */
export function getBestSellers(limit = 4): MockProduct[] {
  const bsFirst = MOCK_PRODUCTS.filter((p) => p.isActive && p.isBestSeller)
  const featured = MOCK_PRODUCTS.filter((p) => p.isActive && p.isFeatured && !p.isBestSeller)
  return [...bsFirst, ...featured].slice(0, limit)
}

export function getProductBySlug(slug: string): MockProduct | undefined {
  return MOCK_PRODUCTS.find((p) => p.slug === slug)
}

export function getProductsByCategory(categorySlug: string): MockProduct[] {
  return MOCK_PRODUCTS.filter((p) => p.categorySlug === categorySlug && p.isActive)
}

export function getProductsByCollection(collectionSlug: string): MockProduct[] {
  return MOCK_PRODUCTS.filter((p) => {
    if (!p.isActive) return false
    const colls = p.collections || (p.collectionWorld && p.collectionWorld !== 'general' ? [p.collectionWorld] : [])
    return colls.includes(collectionSlug)
  })
}

export function getCategoryBySlug(slug: string): MockCategory | undefined {
  if (slug === 'aydinlatma-lamba') {
    return MOCK_CATEGORIES.find((c) => c.slug === 'zuulight')
  }
  return MOCK_CATEGORIES.find((c) => c.slug === slug)
}

/** Converts a MockProduct to the frontend ProductListItem contract */
export function formatMockProductToListItem(p: MockProduct) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    price: p.price,
    oldPrice: p.oldPrice ?? null,
    primaryImage: p.images[0]?.url ?? null,
    secondaryImage: p.images[1]?.url ?? null,
    categoryName: p.categoryName,
    categorySlug: p.categorySlug,
    collections: p.collections || (p.collectionWorld ? [p.collectionWorld] : []),
    isFeatured: p.isFeatured,
    isNew: p.isNew,
    inStock: p.stock > 0,
    stockCount: p.stock,
    reviewCount: p.reviewCount,
    avgRating: p.rating ?? null,
    discountPercent: p.oldPrice && p.oldPrice > p.price
      ? Math.round(((p.oldPrice - p.price) / p.oldPrice) * 100)
      : null,
    sku: p.sku,
  }
}
