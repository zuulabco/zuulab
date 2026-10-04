/**
 * The site's legal documents and corporate pages, in the order the footer and
 * the "other documents" lists show them. Dates are the documents' version dates.
 */
export interface SitePage {
  slug: string
  /** Page heading and <title> */
  title: string
  /** Footer / list label (lowercase, like the rest of the footer) */
  label: string
  /** One sentence for the meta description and the document lists */
  summary: string
}

export interface LegalDoc extends SitePage {
  updated: string
  version: string
}

const V1 = { updated: '2026-10-04', version: '1.0' }

export const LEGAL_DOCS: LegalDoc[] = [
  {
    slug: 'mesafeli-satis-sozlesmesi',
    title: 'Mesafeli satış sözleşmesi',
    label: 'mesafeli satış sözleşmesi',
    summary: 'zuulab’dan yapılan internet alışverişlerinde alıcı ile satıcı arasındaki hak ve yükümlülükler.',
    ...V1,
  },
  {
    slug: 'on-bilgilendirme-formu',
    title: 'Ön bilgilendirme formu',
    label: 'ön bilgilendirme formu',
    summary: 'Siparişten önce satıcı, ürün, fiyat, ödeme, teslimat ve cayma hakkı hakkında bilmeniz gerekenler.',
    ...V1,
  },
  {
    slug: 'iade-politikasi',
    title: 'İade ve cayma politikası',
    label: 'iade ve cayma',
    summary: '14 gün cayma hakkı, ücretsiz iade, para iadesi ve kişiye özel ürünlerde istisnalar.',
    ...V1,
  },
  {
    slug: 'kvkk-aydinlatma-metni',
    title: 'KVKK aydınlatma metni',
    label: 'kvkk aydınlatma metni',
    summary: 'Kişisel verilerinizin hangi amaçlarla, hangi hukuki sebeplerle işlendiği ve haklarınız.',
    ...V1,
  },
  {
    slug: 'gizlilik-politikasi',
    title: 'Gizlilik ve güvenlik politikası',
    label: 'gizlilik politikası',
    summary: 'Verilerinizi nasıl koruduğumuz, ödeme güvenliği ve hesap güvenliği.',
    ...V1,
  },
  {
    slug: 'cerez-politikasi',
    title: 'Çerez politikası',
    label: 'çerez politikası',
    summary: 'Sitemizde kullanılan zorunlu ve analiz çerezleri, tercihlerinizi nasıl değiştireceğiniz.',
    ...V1,
  },
  {
    slug: 'acik-riza-metni',
    title: 'Açık rıza metni',
    label: 'açık rıza metni',
    summary: 'Analiz çerezleri ve kişisel verilerin yurt dışındaki hizmet sağlayıcılara aktarımı için onay.',
    ...V1,
  },
  {
    slug: 'ticari-elektronik-ileti-onayi',
    title: 'Ticari elektronik ileti onay metni',
    label: 'ticari ileti onayı',
    summary: 'Bülten ve kampanya e-postaları için verdiğiniz onay ve onayınızı geri alma yolları.',
    ...V1,
  },
  {
    slug: 'kvkk-basvuru-formu',
    title: 'KVKK başvuru formu',
    label: 'kvkk başvuru formu',
    summary: 'Kişisel verilerinizle ilgili haklarınızı kullanmak için başvuru yolları ve form.',
    ...V1,
  },
  {
    slug: 'kullanim-kosullari',
    title: 'Kullanım koşulları',
    label: 'kullanım koşulları',
    summary: 'zuulab.com’u ve üyelik hesabınızı kullanırken geçerli kurallar.',
    ...V1,
  },
  {
    slug: 'satici-bilgileri',
    title: 'Satıcı bilgileri',
    label: 'satıcı bilgileri',
    summary: 'zuulab’ın işletme, vergi ve iletişim bilgileri.',
    ...V1,
  },
]

export const CORPORATE_PAGES: SitePage[] = [
  { slug: 'hakkimizda', title: 'Hakkımızda', label: 'hakkımızda', summary: 'zuulab’ın hikayesi, atölyesi ve ilkeleri.' },
  { slug: 'uretim-sureci', title: 'Üretim süreci', label: 'üretim süreci', summary: 'Bir zuulab ürününün tasarımdan kapınıza yolculuğu.' },
  { slug: 'ozel-uretim', title: 'Özel üretim ve toptan', label: 'özel üretim & toptan', summary: 'Kendi modelinizi bastırın ya da işletmeniz için toplu sipariş verin.' },
  { slug: 'kargo-ve-teslimat', title: 'Kargo ve teslimat', label: 'kargo ve teslimat', summary: 'Hazırlık süreleri, kargo firmaları ve ücretleri.' },
  { slug: 'sss', title: 'Sıkça sorulan sorular', label: 'sıkça sorulan sorular', summary: 'Sipariş, kargo, iade, ürünler ve özel üretim hakkında sorular.' },
  { slug: 'iletisim', title: 'İletişim', label: 'iletişim', summary: 'Bize ulaşmanın yolları.' },
]

export const legalDoc = (slug: string): LegalDoc => {
  const doc = LEGAL_DOCS.find((d) => d.slug === slug)
  if (!doc) throw new Error(`Unknown legal document: ${slug}`)
  return doc
}

/** "2026-10-04" → "4 Ekim 2026" */
export const formatDocDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
