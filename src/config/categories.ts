export interface CategoryConfig {
  id: string
  name: string
  slug: string
  description: string
  sortOrder: number
  seo: {
    title: string
    description: string
  }
}

export const CATEGORY_CONFIGS: Record<string, CategoryConfig> = {
  aydinlatmalar: {
    id: 'cat-aydinlatmalar',
    name: 'Aydınlatmalar',
    slug: 'aydinlatmalar',
    description: 'Lithophane ışık tabloları, parametrik abajurlar ve ambiyans lambaları.',
    sortOrder: 1,
    seo: {
      title: 'Aydınlatmalar — zuulab 3D Tasarım Lambalar ve Abajurlar',
      description: 'Litofan ay lambaları, parametrik hive masa lambaları ve ambiyans aydınlatma tasarımları.',
    },
  },
  figurler: {
    id: 'cat-figurler',
    name: 'Figürler',
    slug: 'figurler',
    description: '3D baskı karakter, heykel ve koleksiyonluk figür tasarımları.',
    sortOrder: 2,
    seo: {
      title: 'Figürler — zuulab 3D Baskı Sanat ve Karakter Heykelleri',
      description: 'Mini dinozor setleri, Kyoto düşünen insan heykelleri ve tasarım objeleri.',
    },
  },
  'oyun-eglence': {
    id: 'cat-oyun-eglence',
    name: 'Oyun ve Eğlence',
    slug: 'oyun-eglence',
    description: 'Strateji oyunları, montessori eğitim materyalleri ve interaktif oyuncaklar.',
    sortOrder: 3,
    seo: {
      title: 'Oyun ve Eğlence — zuulab Güvenli 3D Çocuk ve Kutu Oyunları',
      description: 'Denge panda aile oyunu, duyulab dokunma küpü ve montessori eğitim geometri setleri.',
    },
  },
  'masaustu-organizer': {
    id: 'cat-masaustu-organizer',
    name: 'Masaüstü & Organizer',
    slug: 'masaustu-organizer',
    description: 'Kulaklık standları, kablo düzenleyiciler ve modüler masaüstü organizerlar.',
    sortOrder: 4,
    seo: {
      title: 'Masaüstü & Organizer — zuulab Çalışma Alanı Düzenleyicileri',
      description: 'Vortex geometrik kulaklık standları, manyetik kablo barları ve altıgen masaüstü setleri.',
    },
  },
  'saksi-dekorasyon': {
    id: 'cat-saksi-dekorasyon',
    name: 'Saksı & Dekorasyon',
    slug: 'saksi-dekorasyon',
    description: 'Parametrik vazolar, geometrik saksılar ve modern ev dekorasyon objeleri.',
    sortOrder: 5,
    seo: {
      title: 'Saksı & Dekorasyon — zuulab Parametrik Vazolar ve Dekoratif Objeler',
      description: 'Aura spiral parametrik vazolar ve yaşam alanınızı güzelleştiren tasarım dekorasyonlar.',
    },
  },
  'ev-yasam': {
    id: 'cat-ev-yasam',
    name: 'Ev & Yaşam',
    slug: 'ev-yasam',
    description: 'Yaşam alanlarına değer katan fonksiyonel ve estetik tasarım objeleri.',
    sortOrder: 6,
    seo: {
      title: 'Ev & Yaşam — zuulab Estetik ve Fonksiyonel Tasarım Parçaları',
      description: 'Atölyemizde PLA ve PETG ile üretilen modern ev aksesuarları ve ergonomik tasarım ürünleri.',
    },
  },
  anahtarliklar: {
    id: 'cat-anahtarliklar',
    name: 'Anahtarlıklar',
    slug: 'anahtarliklar',
    description: 'Kişiselleştirilebilir ve tematik 3D baskı anahtarlık tasarımları.',
    sortOrder: 7,
    seo: {
      title: 'Anahtarlıklar — zuulab Özgün 3D Baskı Anahtarlık Tasarımları',
      description: 'Geometrik, tipografik ve eğlenceli 3D baskı anahtarlık modelleri.',
    },
  },
  'kitap-ayraci': {
    id: 'cat-kitap-ayraci',
    name: 'Kitap Ayracı',
    slug: 'kitap-ayraci',
    description: 'Minimalist ve yaratıcı 3D baskı kitap ayraçları.',
    sortOrder: 8,
    seo: {
      title: 'Kitap Ayracı — zuulab 3D Baskı Kitap Ayraçları',
      description: 'Kitap tutkunları için ince detaylı, geometrik ve esnek kitap ayraçları.',
    },
  },
  aksesuarlar: {
    id: 'cat-aksesuarlar',
    name: 'Aksesuarlar',
    slug: 'aksesuarlar',
    description: 'Giyilebilir ve taşınabilir modern tasarım aksesuarları.',
    sortOrder: 9,
    seo: {
      title: 'Aksesuarlar — zuulab Günlük Yaşam Tasarım Aksesuarları',
      description: 'Gözlük standları, çanta aksesuarları ve taşınabilir 3D baskı objeleri.',
    },
  },
  hediyelik: {
    id: 'cat-hediyelik',
    name: 'Hediyelik',
    slug: 'hediyelik',
    description: 'Özel günler ve kurumsal tebrikler için özgün tasarım hediye kitleri.',
    sortOrder: 10,
    seo: {
      title: 'Hediyelik — zuulab Kişiye ve Kuruma Özel Tasarım Hediyeler',
      description: 'Geometrik kurumsal masaüstü hediye kitleri ve unutulmaz tasarım armağanlar.',
    },
  },
  'ozel-tasarim': {
    id: 'cat-ozel-tasarim',
    name: 'Özel Tasarım / Diğer',
    slug: 'ozel-tasarim',
    description: 'Kişiye ve kuruma özel butik 3D üretimler ve sınırlı seri prototipler.',
    sortOrder: 11,
    seo: {
      title: 'Özel Tasarım / Diğer — zuulab Butik 3D Tasarım & Üretim',
      description: 'Özel logolu standlar, kurumsal bloklar ve deneysel tasarım projeleri.',
    },
  },
}

export function getCategoryConfig(slug: string): CategoryConfig | undefined {
  return CATEGORY_CONFIGS[slug]
}

export const ALL_CATEGORY_SLUGS = Object.keys(CATEGORY_CONFIGS)
export const ALL_CATEGORIES = Object.values(CATEGORY_CONFIGS).sort((a, b) => a.sortOrder - b.sortOrder)
