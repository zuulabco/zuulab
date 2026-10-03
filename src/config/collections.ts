export interface CollectionPillar {
  title: string
  description: string
}

export interface CollectionConfig {
  slug: string
  name: string
  label: string
  logo: string
  logoNeedsDarkBg: boolean
  logoWidth: number
  logoHeight: number
  tagline: string
  editorialTitle: string
  editorialStatement: string
  description: string
  heroImage: string
  secondaryImage?: string
  accentColor: string
  theme: 'playful-warm' | 'calm-lifestyle' | 'atmospheric-dark' | 'business-clear' | 'editorial'
  pillars: CollectionPillar[]
  featuredProductSlug?: string
  b2b?: {
    isWholesale: boolean
    minOrderQty: number
    leadTime: string
    inquiryEmail: string
  }
  seo: {
    title: string
    description: string
  }
}

export const COLLECTION_CONFIGS: Record<string, CollectionConfig> = {
  zuukids: {
    slug: 'zuukids',
    name: 'zuukids',
    label: 'zuukids',
    logo: '/zuukids_logo.svg',
    logoNeedsDarkBg: false,
    logoWidth: 180,
    logoHeight: 94,
    tagline: 'çocuklar için güvenli 3d tasarım evreni',
    editorialTitle: 'merakı besleyen, dokunarak öğrenilen formlar.',
    editorialStatement:
      'çocukların hayal gücünü geliştiren, yuvarlatılmış güvenli kenarlara sahip, ftalat ve bpa içermeyen mısır nişastası bazlı pla biyo-polimer oyuncaklar ve montessori eğitim materyalleri.',
    description:
      'çocuklar için eğlenceli, güvenli ve renkli 3d baskı ürün dünyası. oyuncaklar, eğitim materyalleri ve yaratıcı masaüstü aksesuarlar.',
    heroImage: 'https://images.unsplash.com/photo-1587654780291-39c9404d746b?auto=format&fit=crop&w=1600&q=85',
    secondaryImage: 'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?auto=format&fit=crop&w=1200&q=80',
    accentColor: '#eab828',
    theme: 'playful-warm',
    featuredProductSlug: 'zuukids-vidali-sekil-eslestirme-ve-siralama-seti',
    pillars: [
      {
        title: '100% biyo-çözünür pla',
        description: 'gıda ile temasa uygun, çevre ve çocuk dostu doğal mısır nişastası bazlı biyo-polimer hammadde.',
      },
      {
        title: 'sıfır keskin kenar',
        description: 'her model çocuk ergonomisine ve güvenliğine göre özel yumuşatılmış radiuslarla 0.12mm hassasiyette basılır.',
      },
      {
        title: 'dokunarak öğrenme',
        description: 'montessori prensiplerine uygun, 3 boyutlu algıyı ve motor koordinasyonu güçlendiren somut parçalar.',
      },
    ],
    seo: {
      title: 'zuukids — güvenli ve yaratıcı çocuk ürünleri',
      description: 'zuukids: çocuklar için biyo-bozunur pla oyuncaklar, montessori eğitim araçları ve renkli 3d tasarımlar.',
    },
  },

  zuulife: {
    slug: 'zuulife',
    name: 'zuulife',
    label: 'zuulife',
    logo: '/zuulife_logo.svg',
    logoNeedsDarkBg: true,
    logoWidth: 170,
    logoHeight: 68,
    tagline: 'modern yaşam alanı ve çalışma masası objeleri',
    editorialTitle: 'masanızdaki fazlalıklardan arınmış mimari denge.',
    editorialStatement:
      'masaüstü organizerleri, takı ağaçları ve ev objeleri. günlük düzeninizi sadeleştiren, her gün kullanılan işlevsel tasarımlar.',
    description:
      'ev, yaşam ve çalışma alanı için tasarlanmış 3d baskı objeleri: masaüstü organizerleri, takı organizerleri ve ev aksesuarları.',
    heroImage: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1600&q=85',
    secondaryImage: 'https://images.unsplash.com/photo-1593062096033-9a26b09da705?auto=format&fit=crop&w=1200&q=80',
    accentColor: '#0080c4',
    theme: 'calm-lifestyle',
    featuredProductSlug: 'vortex-geometrik-kulaklik-standi',
    pillars: [
      {
        title: '0.12mm katman hassasiyeti',
        description: 'endüstriyel fdm yazıcılarımızda katman çizgileri pürüzsüzleştirilmiş mimari yüzeyler.',
      },
      {
        title: 'manyetik modülerlik',
        description: 'n52 neodimyum mıknatıslar ile dilediğiniz gibi birleşen ve ayrılan ergonomik modüller.',
      },
      {
        title: 'dengeli ağırlık merkezi',
        description: 'ağır kulaklık ve cihazları devrilmeksizin taşıyan statik ağırlık dağılımı.',
      },
    ],
    seo: {
      title: 'zuulife — modern yaşam ve masaüstü objeleri',
      description: 'zuulife: parametrik kulaklık stantları, modüler masa düzenleyiciler ve estetik yaşam alanı parçaları.',
    },
  },

  zuulight: {
    slug: 'zuulight',
    name: 'zuulight',
    label: 'zuulight',
    logo: '/zuulight_logo.svg',
    logoNeedsDarkBg: true,
    logoWidth: 180,
    logoHeight: 64,
    tagline: 'ışık ve gölgenin parametrik buluşması',
    editorialTitle: 'katmanlardan süzülen sakin ve sıcak ambiyans.',
    editorialStatement:
      'katman katman basılan parametrik gövdeler ışığı süzer, duvara desen düşürür. açıkken ortamı ısıtan, kapalıyken bir obje gibi duran masa lambaları.',
    description:
      'parametrik desenli masa lambaları; katmanlardan süzülen ışık ve duvara düşen gölge desenleri.',
    heroImage: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1600&q=85',
    secondaryImage: 'https://images.unsplash.com/photo-1532767153582-b1a0e5145009?auto=format&fit=crop&w=1200&q=80',
    accentColor: '#fec80f',
    theme: 'atmospheric-dark',
    featuredProductSlug: 'zuulight-spira-masa-lambasi',
    pillars: [
      {
        title: 'parametrik katman deseni',
        description: 'gövdedeki desen ışığı süzer; lamba açıldığında duvara ve masaya yumuşak gölgeler düşer.',
      },
      {
        title: 'sıcak ambiyans ışığı',
        description: 'göz almayan, dağınık ve yumuşak bir ışıkla akşam saatleri için sakin bir ortam.',
      },
      {
        title: 'masa ve komodin ölçüsü',
        description: 'çalışma masası, komodin ya da raf üzerinde yer kaplamadan duran kompakt formlar.',
      },
    ],
    seo: {
      title: 'zuulight — parametrik masa lambaları',
      description: 'zuulight: parametrik desenli masa lambaları ve ambiyans aydınlatma.',
    },
  },

  zuutoptan: {
    slug: 'zuutoptan',
    name: 'zuutoptan',
    label: 'zuutoptan',
    logo: '/zuutoptan_logo.svg',
    logoNeedsDarkBg: true,
    logoWidth: 190,
    logoHeight: 60,
    tagline: 'işletmeler ve markalar için seri 3d üretim',
    editorialTitle: 'ölçeklenebilir üretim kapasitesi, butik detay özeni.',
    editorialStatement:
      'kafe, restoran, otel ve kurumsal ofisler için markanıza özel logolu masaüstü çözümleri, qr menü stantları ve kurumsal hediyelikler. minimum 25 adetten başlayan esnek parti üretimi.',
    description:
      'butikler, mağazalar ve kurumsal işletmeler için toptan 3d baskı ürünleri. özel logo, pantone renk eşleme ve kademeli indirimler.',
    heroImage: 'https://images.unsplash.com/photo-1554188248-986adbb73be4?auto=format&fit=crop&w=1600&q=85',
    secondaryImage: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
    accentColor: '#1a1a19',
    theme: 'business-clear',
    featuredProductSlug: 'ozel-logolu-masaustu-stand-toptan',
    b2b: {
      isWholesale: true,
      minOrderQty: 25,
      leadTime: '3-5 iş günü',
      inquiryEmail: 'toptan@zuulab.com',
    },
    pillars: [
      {
        title: 'kurumsal logo entegrasyonu',
        description: 'tasarımlarınıza gömme ya da kabartma 3d vektörel şirket logosu uygulaması.',
      },
      {
        title: 'kademeli hacim indirimi',
        description: '25, 50, 100 ve 500+ adet sipariş bantlarında otomatik birim fiyat avantajı.',
      },
      {
        title: 'hızlı fiziksel numune',
        description: 'seri üretime başlamadan önce 48 saat içinde kontrol numunesi onayı.',
      },
    ],
    seo: {
      title: 'zuutoptan — kurumsal ve toptan 3d baskı çözümleri',
      description: 'zuutoptan: kafe qr stantları, kurumsal logolu masaüstü ürünler ve butik toptan 3d üretim.',
    },
  },

  koleksiyonlar: {
    slug: 'koleksiyonlar',
    name: 'koleksiyonlar',
    label: 'koleksiyonlar',
    logo: '',
    logoNeedsDarkBg: false,
    logoWidth: 160,
    logoHeight: 50,
    tagline: 'sınırlı seri ve deneysel tasarım parçaları',
    editorialTitle: 'matematik, form ve mimarinin kesişim noktası.',
    editorialStatement:
      'deneysel geometri araştırmalarından doğan sınırlı üretim heykeller, parametrik sanat objeleri ve tasarımcı iş birlikleri.',
    description:
      'zuulab sınırlı koleksiyonlar, özel seriler ve tasarımcı iş birliği parçaları.',
    heroImage: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=1600&q=85',
    accentColor: '#70706a',
    theme: 'editorial',
    featuredProductSlug: 'kyoto-dusunen-insan-heykeli',
    pillars: [
      {
        title: 'numaralandırılmış seri',
        description: 'her obje sınırlı sayıda üretilir ve altında özgün seri numarası bulunur.',
      },
      {
        title: 'mat taş dokulu yüzey',
        description: 'özel mineral katkılı polimer ile doğal taş hissi veren ağırlık ve mikrotekstür.',
      },
      {
        title: 'tek parça monolitik form',
        description: 'ek yeri ve montaj vidası olmaksızın tek seferde heykelsi akışla üretilir.',
      },
    ],
    seo: {
      title: 'koleksiyonlar — zuulab sınırlı seri tasarım objeleri',
      description: 'zuulab özel seriler: deneysel heykeller, parametrik monolitler ve tasarımcı objeleri.',
    },
  },
}

/** Helper to retrieve collection config by slug (handles aliasing) */
export function getCollectionConfig(slug: string): CollectionConfig | undefined {
  if (slug === 'aydinlatma-lamba') {
    return COLLECTION_CONFIGS['zuulight']
  }
  return COLLECTION_CONFIGS[slug]
}

/** All valid collection slugs for static paths */
export const ALL_COLLECTION_SLUGS = Object.keys(COLLECTION_CONFIGS)
export const ALL_COLLECTIONS = Object.values(COLLECTION_CONFIGS)
