import { getProducts, getCategories, getCollections } from '@/lib/services/products.service'
import { getStoreSettings } from '@/lib/services/settings/store-settings.service'
import { absoluteUrl, metaDescription, productSummary } from '@/lib/seo/metadata'
import { BUSINESS } from '@/lib/seo/jsonld'

/**
 * /llms.txt (llmstxt.org): a plain-markdown map of the shop for AI assistants
 * and answer engines, which mostly read pages without running JavaScript.
 * Built from the live catalog and store settings, so it follows every admin edit.
 */
// Cached like the catalog pages: rebuilt when the catalog tag is invalidated, at most every 10 minutes.
export const dynamic = 'force-static'
export const revalidate = 600

const tl = (n: number) => `${n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} TL`
const line = (text: string) => metaDescription(text, 200)

export async function GET() {
  const [categories, collections, { items: products }, settings] = await Promise.all([
    getCategories(),
    getCollections(),
    getProducts({ sort: 'bestseller', limit: 1000 }),
    getStoreSettings(),
  ])

  const shipping = settings.shipping
  const out: string[] = [
    '# zuulab',
    '',
    `> ${BUSINESS.description} Sipariş yalnızca Türkiye içine gönderilir; fiyatlar Türk lirası ve KDV dahildir.`,
    '',
    '## Mağaza bilgileri',
    '',
    `- Site: ${absoluteUrl('/')}`,
    `- Konum: ${BUSINESS.locality}, Türkiye (kendi atölyesinde üretim)`,
    `- E-posta: ${BUSINESS.email}`,
    `- Telefon: ${BUSINESS.phoneDisplay} (hafta içi 09:00–18:00)`,
    `- Kargo: ${shipping.carrier}, ${shipping.estimatedDelivery}; ücret ${tl(shipping.fee)}, ${tl(settings.freeShippingThreshold)} ve üzeri siparişlerde ücretsiz`,
    '- İade: teslimden itibaren 14 gün cayma hakkı, ücretsiz iade kargo kodu (kişiye özel ürünler hariç)',
    '- Ödeme: kredi ve banka kartı (PayTR güvenli ödeme)',
    '- Üretim: FDM 3D baskı; PLA+, PETG ve biyo-polimer malzemeler',
    '',
    '## Koleksiyonlar',
    '',
    ...collections.map(
      (c) => `- [${c.name}](${absoluteUrl(`/koleksiyon/${c.slug}`)}): ${line(c.seoDescription || c.shortDescription || c.description)}`
    ),
    '',
    '## Kategoriler',
    '',
    ...categories
      .filter((c) => c.productCount > 0)
      .map(
        (c) =>
          `- [${c.name}](${absoluteUrl(`/kategori/${c.slug}`)}): ${c.productCount} ürün${c.description ? `. ${line(c.description)}` : ''}`
      ),
    '',
    '## Ürünler',
    '',
    ...products.map((p) => {
      const price = p.oldPrice ? `${tl(p.price)} (önceki fiyat ${tl(p.oldPrice)})` : tl(p.price)
      const stock = p.stock > 0 ? 'stokta' : 'stokta yok'
      const summary = line(productSummary(p))
      return `- [${p.name}](${absoluteUrl(`/urun/${p.slug}`)}): ${price}, ${stock}, ${p.categoryName}.${summary ? ` ${summary}` : ''}`
    }),
    '',
    '## Kurumsal',
    '',
    `- [Hakkımızda](${absoluteUrl('/hakkimizda')}): zuulab'ın hikayesi ve tasarım ilkeleri`,
    `- [Üretim süreci](${absoluteUrl('/uretim-sureci')}): tasarımdan paketlemeye 5 aşamalı 3D baskı süreci`,
    `- [İletişim](${absoluteUrl('/iletisim')}): sipariş, kişiye özel tasarım ve toptan üretim talepleri`,
    '',
    '## Politikalar',
    '',
    `- [İade ve değişim politikası](${absoluteUrl('/iade-politikasi')})`,
    `- [Gizlilik ve güvenlik politikası](${absoluteUrl('/gizlilik-politikasi')})`,
    `- [Kullanım koşulları](${absoluteUrl('/kullanim-kosullari')})`,
    '',
  ]

  return new Response(out.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
