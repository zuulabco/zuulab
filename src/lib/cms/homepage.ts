/**
 * The homepage as data: hero slides, an ordered list of sections, and the announcement
 * bar. Edited in the admin (Vitrin → Ana sayfa / Duyuru bandı), stored in the database
 * as a draft and a published copy, and rendered by src/app/(store)/page.tsx.
 *
 * Shared by the admin editor and the storefront, so it holds no server code.
 */

export type SlideTheme = 'light' | 'dark'
export type SlideAccent = 'blue' | 'yellow'
export type SecondaryMode = 'product' | 'link' | 'none'

export interface HeroSlide {
  id: string
  enabled: boolean
  /** Short name on the slider tabs, e.g. "zuukids" */
  label: string
  /** Small line above the headline */
  badge: string
  headline: string
  /** Second, italic line of the headline */
  headlineAccent: string
  description: string
  imageUrl: string
  /** Optional portrait image for phones; the desktop image is used when empty */
  mobileImageUrl: string
  /** Which part of the photo stays in view when it is cropped */
  focus: 'center' | 'left' | 'right'
  theme: SlideTheme
  accent: SlideAccent
  primaryLabel: string
  primaryHref: string
  /** The second button: a product, any link, or nothing */
  secondaryMode: SecondaryMode
  secondaryProductSlug: string
  secondaryLabel: string
  secondaryHref: string
}

export interface HeroConfig {
  active: boolean
  autoplay: boolean
  /** Seconds each slide stays before the next */
  interval: number
  slides: HeroSlide[]
}

export type ProductSource = 'bestsellers' | 'newest' | 'favorites' | 'collection' | 'category' | 'manual'

export interface ProductRailSettings {
  eyebrow: string
  title: string
  source: ProductSource
  collectionSlug: string
  categorySlug: string
  productSlugs: string[]
  limit: 4 | 8
  tone: 'plain' | 'muted'
  viewAllLabel: string
  /** Empty: a sensible link for the source is used */
  viewAllHref: string
}

export interface SpotlightSettings {
  eyebrow: string
  eyebrowNote: string
  headline: string
  headlineAccent: string
  lead: string
  /** Product to feature; empty = best seller of the collection */
  productSlug: string
  collectionSlug: string
  pillars: Array<{ title: string; desc: string }>
  linkLabel: string
  linkHref: string
}

export interface BannerSettings {
  eyebrow: string
  title: string
  subtitle: string
  description: string
  ctaText: string
  ctaHref: string
  imageUrl: string
  imageAlt: string
  align: 'left' | 'right'
  theme: 'dark' | 'light'
}

export interface TextCtaSettings {
  eyebrow: string
  title: string
  body: string
  ctaLabel: string
  ctaHref: string
  align: 'left' | 'center'
  tone: 'plain' | 'muted' | 'dark'
}

export interface LifestyleTile {
  imageUrl: string
  alt: string
  /** Small caption on the photo; empty hides it */
  label: string
  /** Optional link when the photo is clicked */
  href: string
}

export interface LifestyleSettings {
  heading: string
  body: string
  linkLabel: string
  linkHref: string
  /** Tall, wide and square photo, in that order */
  tiles: [LifestyleTile, LifestyleTile, LifestyleTile]
}

export type EmptySettings = Record<string, never>

export interface SectionSettingsMap {
  category_strip: EmptySettings
  collections_grid: EmptySettings
  product_rail: ProductRailSettings
  product_spotlight: SpotlightSettings
  banner: BannerSettings
  text_cta: TextCtaSettings
  process: EmptySettings
  lifestyle: LifestyleSettings
  final_discovery: EmptySettings
  newsletter: EmptySettings
}

export type SectionType = keyof SectionSettingsMap

export type HomeSection = {
  [T in SectionType]: { id: string; type: T; enabled: boolean; settings: SectionSettingsMap[T] }
}[SectionType]

export interface AnnouncementItem {
  id: string
  text: string
  ctaLabel?: string
  ctaHref?: string
  active: boolean
  sortOrder: number
}

export interface HomepageDocument {
  version: 2
  hero: HeroConfig
  sections: HomeSection[]
  announcements: AnnouncementItem[]
}

// ── Section catalogue (the "add section" gallery) ────────────

export interface SectionTemplate<T extends SectionType = SectionType> {
  type: T
  name: string
  description: string
  /** Can appear more than once on the page */
  repeatable: boolean
  defaults: () => SectionSettingsMap[T]
}

const railDefaults = (over: Partial<ProductRailSettings> = {}): ProductRailSettings => ({
  eyebrow: 'zuulab / seçki',
  title: 'en çok satanlar',
  source: 'bestsellers',
  collectionSlug: '',
  categorySlug: '',
  productSlugs: [],
  limit: 4,
  tone: 'plain',
  viewAllLabel: 'tümünü gör',
  viewAllHref: '',
  ...over,
})

export const SECTION_TEMPLATES: { [T in SectionType]: SectionTemplate<T> } = {
  product_rail: {
    type: 'product_rail',
    name: 'Ürün şeridi',
    description: 'Dört ya da sekiz ürün kartı: çok satanlar, yeniler, favoriler, bir koleksiyon, bir kategori ya da seçtiğiniz ürünler.',
    repeatable: true,
    defaults: () => railDefaults(),
  },
  banner: {
    type: 'banner',
    name: 'Görselli banner',
    description: 'Yarım sayfa görsel ve yanında başlık, açıklama, buton. Koleksiyon ya da kampanya tanıtımı için.',
    repeatable: true,
    defaults: () => ({
      eyebrow: 'yeni koleksiyon',
      title: 'başlık',
      subtitle: 'kısa bir alt başlık.',
      description: 'iki üç cümlelik açıklama.',
      ctaText: 'keşfet',
      ctaHref: '/urunler',
      imageUrl: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1400&q=85',
      imageAlt: '',
      align: 'left',
      theme: 'dark',
    }),
  },
  product_spotlight: {
    type: 'product_spotlight',
    name: 'Ürün vitrini',
    description: 'Tek ürünü büyük görselle öne çıkarır; dört kısa özellik ve sepete ekle butonu.',
    repeatable: true,
    defaults: () => ({
      eyebrow: 'zuukids',
      eyebrowNote: 'çocuk koleksiyonu',
      headline: 'oyun ve keşif dolu',
      headlineAccent: 'üç boyutlu formlar.',
      lead: 'şekil eşleştirme, sıralama ve kesir oyunlarıyla el-göz koordinasyonunu ve problem çözmeyi destekleyen setler; her parça pürüzsüz yüzey ve yuvarlatılmış kenarlarla basılır.',
      productSlug: '',
      collectionSlug: 'zuukids',
      pillars: [
        { title: 'pla hammadde', desc: 'bitki kaynaklı, kokusuz biyopolimer' },
        { title: 'öğreterek oyun', desc: 'renk, şekil ve sayı kavramları' },
        { title: 'yuvarlatılmış kenarlar', desc: 'çapaksız, elde rahat formlar' },
        { title: 'atölyeden kapınıza', desc: 'özenli paketleme ile gönderim' },
      ],
      linkLabel: 'tüm zuukids koleksiyonu',
      linkHref: '/koleksiyon/zuukids',
    }),
  },
  text_cta: {
    type: 'text_cta',
    name: 'Metin ve buton',
    description: 'Görselsiz, kısa bir mesaj ve tek buton. Duyuru, hikâye ya da yönlendirme için.',
    repeatable: true,
    defaults: () => ({
      eyebrow: '',
      title: 'mekana karakter katan formları keşfedin.',
      body: '',
      ctaLabel: 'tüm ürünleri incele',
      ctaHref: '/urunler',
      align: 'center',
      tone: 'muted',
    }),
  },
  category_strip: {
    type: 'category_strip',
    name: 'Kayan koleksiyon bandı',
    description: 'Koleksiyonlar ve kategoriler kayan bir bant halinde; liste katalogdan otomatik gelir.',
    repeatable: false,
    defaults: () => ({}),
  },
  collections_grid: {
    type: 'collections_grid',
    name: 'Koleksiyon kartları',
    description: 'zuukids, zuulife, zuulight ve zuutoptan dünyaları büyük kartlarla.',
    repeatable: false,
    defaults: () => ({}),
  },
  process: {
    type: 'process',
    name: 'Üretim süreci',
    description: 'Tasarımdan paketlemeye dört adımlık atölye hikâyesi.',
    repeatable: false,
    defaults: () => ({}),
  },
  lifestyle: {
    type: 'lifestyle',
    name: 'Yaşam alanı galerisi',
    description: 'Bir metin kutusu ve üç fotoğraf (dikey, yatay, kare); ürünlerin kullanıldığı mekânlar.',
    repeatable: false,
    defaults: () => ({
      heading: 'mekana karakter katan formlar.',
      body: 'kullanıcılarımızın evlerinden, çocuk odalarından ve çalışma alanlarından objelerimizin günlük yaşamdaki duruşu.',
      linkLabel: '@zuu.lab instagram',
      linkHref: 'https://instagram.com/zuu.lab',
      tiles: [
        {
          imageUrl: 'https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&w=1000&q=85',
          alt: 'zuulab dekorasyon objesi yaşam alanında',
          label: '',
          href: '',
        },
        {
          imageUrl: 'https://images.unsplash.com/photo-1593062096033-9a26b09da705?auto=format&fit=crop&w=1200&q=85',
          alt: 'zuulab çalışma alanı masa organizeri',
          label: 'masan için düzen',
          href: '/koleksiyon/zuulife',
        },
        {
          imageUrl: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=800&q=85',
          alt: 'zuulight masa lambası',
          label: 'zuulight masa lambası',
          href: '/koleksiyon/zuulight',
        },
      ],
    }),
  },
  final_discovery: {
    type: 'final_discovery',
    name: 'Kataloğa yönlendirme',
    description: 'Sayfanın sonunda tüm ürünlere ve koleksiyonlara hızlı geçiş.',
    repeatable: false,
    defaults: () => ({}),
  },
  newsletter: {
    type: 'newsletter',
    name: 'Bülten kaydı',
    description: 'E-posta ile bülten aboneliği formu.',
    repeatable: false,
    defaults: () => ({}),
  },
}

export function newSection<T extends SectionType>(type: T, id = `sec-${Date.now().toString(36)}`): HomeSection {
  return { id, type, enabled: true, settings: SECTION_TEMPLATES[type].defaults() } as HomeSection
}

/** Title shown for a section in the admin list */
export function sectionTitle(s: HomeSection): string {
  const base = SECTION_TEMPLATES[s.type]?.name ?? s.type
  if (s.type === 'product_rail') return `${base}: ${s.settings.title}`
  if (s.type === 'banner' || s.type === 'text_cta') return `${base}: ${s.settings.title}`
  if (s.type === 'product_spotlight') return `${base}: ${s.settings.eyebrow}`
  if (s.type === 'lifestyle') return `${base}: ${s.settings.heading}`
  return base
}

// ── Defaults (what the site shows before anything is saved) ──

export const DEFAULT_SLIDES: HeroSlide[] = [
  {
    id: 'zuukids',
    enabled: true,
    label: 'zuukids',
    badge: 'zuukids · çocuk koleksiyonu',
    headline: 'oynarken öğrenen',
    headlineAccent: 'küçük eller için.',
    description: 'şekil eşleştirme setleri, kesir yapbozları ve sıralama oyunları; keskin kenarı olmayan, pürüzsüz yüzeyli formlar.',
    imageUrl: 'https://images.unsplash.com/photo-1587654780291-39c9404d746b?auto=format&fit=crop&w=1920&q=85',
    mobileImageUrl: '',
    focus: 'center',
    theme: 'light',
    accent: 'yellow',
    primaryLabel: 'zuukids dünyası',
    primaryHref: '/koleksiyon/zuukids',
    secondaryMode: 'product',
    secondaryProductSlug: 'zuukids-vidali-sekil-eslestirme-ve-siralama-seti',
    secondaryLabel: '',
    secondaryHref: '',
  },
  {
    id: 'zuulife',
    enabled: true,
    label: 'zuulife',
    badge: 'zuulife · yaşam ve masa',
    headline: 'işlevsel geometri,',
    headlineAccent: 'düzenli mekanlar.',
    description: 'masaüstü organizerleri, takı ağaçları ve ev objeleri; günlük düzeni sade formlarla bir araya getiren tasarımlar.',
    imageUrl: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1920&q=85',
    mobileImageUrl: '',
    focus: 'center',
    theme: 'light',
    accent: 'blue',
    primaryLabel: 'zuulife koleksiyonu',
    primaryHref: '/koleksiyon/zuulife',
    secondaryMode: 'product',
    secondaryProductSlug: 'zuulife-obsidian-masaustu-organizeri',
    secondaryLabel: '',
    secondaryHref: '',
  },
  {
    id: 'zuulight',
    enabled: true,
    label: 'zuulight',
    badge: 'zuulight · aydınlatma serisi',
    headline: 'ışığı katman katman',
    headlineAccent: 'şekillendiren lambalar.',
    description: 'parametrik desenli masa lambaları; açıkken duvara düşen gölgesiyle, kapalıyken formuyla odaya karakter katar.',
    imageUrl: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1920&q=85',
    mobileImageUrl: '',
    focus: 'center',
    theme: 'dark',
    accent: 'yellow',
    primaryLabel: 'zuulight serisi',
    primaryHref: '/koleksiyon/zuulight',
    secondaryMode: 'product',
    secondaryProductSlug: 'zuulight-spira-masa-lambasi',
    secondaryLabel: '',
    secondaryHref: '',
  },
  {
    id: 'zuulab',
    enabled: true,
    label: 'zuulab',
    badge: 'zuulab · atölye',
    headline: 'üç boyutlu formlar,',
    headlineAccent: 'yaşayan mekanlar.',
    description: 'talebinize özel 3d basılan işlevsel masa objeleri, çocuk dünyası ve aydınlatma formları.',
    imageUrl: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1920&q=85',
    mobileImageUrl: '',
    focus: 'center',
    theme: 'light',
    accent: 'blue',
    primaryLabel: 'tüm koleksiyonlar',
    primaryHref: '/koleksiyonlar',
    secondaryMode: 'link',
    secondaryProductSlug: '',
    secondaryLabel: 'tüm ürünler',
    secondaryHref: '/urunler',
  },
]

export const DEFAULT_SECTIONS: HomeSection[] = [
  { id: 'sec-strip', type: 'category_strip', enabled: true, settings: {} },
  { id: 'sec-collections', type: 'collections_grid', enabled: true, settings: {} },
  { id: 'sec-bestsellers', type: 'product_rail', enabled: true, settings: railDefaults() },
  { id: 'sec-spotlight', type: 'product_spotlight', enabled: true, settings: SECTION_TEMPLATES.product_spotlight.defaults() },
  {
    id: 'sec-newest',
    type: 'product_rail',
    enabled: true,
    settings: railDefaults({ eyebrow: 'atölyeden yeni çıkanlar', title: 'yeni gelenler', source: 'newest', tone: 'muted' }),
  },
  {
    id: 'sec-banner-light',
    type: 'banner',
    enabled: true,
    settings: {
      eyebrow: 'zuulight aydınlatma serisi',
      title: 'ışık, farklı yansıtıldı.',
      subtitle: 'parametrik desenli masa lambaları.',
      description: 'katman katman basılan gövdeler ışığı süzerek duvara desen düşürür; her lamba açıkken de kapalıyken de odanın bir parçası olur.',
      ctaText: 'koleksiyonu keşfet',
      ctaHref: '/koleksiyon/zuulight',
      imageUrl: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1400&q=85',
      imageAlt: 'zuulight ambiyans lambası',
      align: 'left',
      theme: 'dark',
    },
  },
  {
    id: 'sec-light-picks',
    type: 'product_rail',
    enabled: true,
    settings: railDefaults({ eyebrow: 'aydınlatma', title: 'zuulight seçkisi', source: 'collection', collectionSlug: 'zuulight', viewAllLabel: 'tüm lambalar' }),
  },
  { id: 'sec-process', type: 'process', enabled: true, settings: {} },
  {
    id: 'sec-favorites',
    type: 'product_rail',
    enabled: true,
    settings: railDefaults({ eyebrow: 'müşterilerimizin listelerinden', title: 'en çok favorilenenler', source: 'favorites', tone: 'muted' }),
  },
  { id: 'sec-lifestyle', type: 'lifestyle', enabled: true, settings: SECTION_TEMPLATES.lifestyle.defaults() },
  { id: 'sec-final', type: 'final_discovery', enabled: true, settings: {} },
  { id: 'sec-newsletter', type: 'newsletter', enabled: true, settings: {} },
]

export const DEFAULT_ANNOUNCEMENTS: AnnouncementItem[] = [
  { id: 'ann-1', text: 'zuukids yeni serisi yayında — çocuk güvenli pla objeleri', ctaLabel: 'incele', ctaHref: '/koleksiyon/zuukids', active: true, sortOrder: 1 },
  { id: 'ann-2', text: '750 ₺ ve üzeri tüm siparişlerde ücretsiz kargo', active: true, sortOrder: 2 },
  { id: 'ann-3', text: 'kendi atölyemizde 3d üretim', active: true, sortOrder: 3 },
  { id: 'ann-4', text: 'zuulight parametrik masa lambaları', ctaLabel: 'keşfet', ctaHref: '/koleksiyon/zuulight', active: true, sortOrder: 4 },
]

export function defaultHomepage(): HomepageDocument {
  return {
    version: 2,
    hero: { active: true, autoplay: true, interval: 6, slides: structuredClone(DEFAULT_SLIDES) },
    sections: structuredClone(DEFAULT_SECTIONS),
    announcements: structuredClone(DEFAULT_ANNOUNCEMENTS),
  }
}

/** Fills gaps in a stored or submitted document so the site never renders half a slide. */
export function normalizeHomepage(input: unknown): HomepageDocument {
  const base = defaultHomepage()
  const doc = (input ?? {}) as Partial<HomepageDocument>
  const heroIn = (doc.hero ?? {}) as Partial<HeroConfig>
  const slides = Array.isArray(heroIn.slides)
    ? heroIn.slides.map((s, i) => ({ ...DEFAULT_SLIDES[0], ...s, id: s?.id || `slide-${i}` }))
    : base.hero.slides
  const sections = Array.isArray(doc.sections)
    ? doc.sections
        .filter((s): s is HomeSection => Boolean(s && s.type in SECTION_TEMPLATES))
        .map((s) => ({ ...s, settings: { ...SECTION_TEMPLATES[s.type].defaults(), ...(s.settings as object) } }) as HomeSection)
    : base.sections
  const announcements = Array.isArray(doc.announcements)
    ? doc.announcements
        .filter((a) => a && typeof a.text === 'string')
        .map((a, i) => ({ ...a, sortOrder: i + 1, active: a.active !== false }))
    : base.announcements
  return {
    version: 2,
    hero: {
      active: heroIn.active !== false,
      autoplay: heroIn.autoplay !== false,
      interval: Math.min(15, Math.max(3, Number(heroIn.interval) || 6)),
      slides,
    },
    sections,
    announcements,
  }
}
