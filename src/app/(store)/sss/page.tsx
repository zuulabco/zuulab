import type { Metadata } from 'next'
import Link from 'next/link'
import { pageMetadata } from '@/lib/seo/metadata'
import { JsonLd } from '@/lib/seo/jsonld'
import { getShippingTerms } from '@/lib/legal/terms'
import { COMPANY, SALES_TERMS } from '@/config/company'
import { Block, CorporatePage, CtaBand, Hero } from '@/components/content/Corporate'
import s from '@/components/content/Corporate.module.css'

export const metadata: Metadata = pageMetadata({
  title: 'Sıkça sorulan sorular',
  description:
    'zuulab SSS: ödeme, kargo süresi ve ücreti, iade ve cayma hakkı, PLA/PETG ürünlerin bakımı, lambalar, kişiye özel 3D baskı ve toptan sipariş.',
  path: '/sss',
})

interface Faq {
  q: string
  /** Plain text: also used as the structured-data answer */
  a: string
  link?: { href: string; label: string }
}

export default async function FaqPage() {
  const ship = await getShippingTerms()
  const T = SALES_TERMS

  const groups: Array<{ title: string; items: Faq[] }> = [
    {
      title: 'sipariş ve ödeme',
      items: [
        {
          q: 'Hangi ödeme yöntemlerini kabul ediyorsunuz?',
          a: 'Şu an kredi kartı ve banka kartıyla, PayTR güvenli ödeme altyapısı üzerinden 3D Secure doğrulamasıyla ödeme alıyoruz. Kart bilgileriniz bizde saklanmaz.',
        },
        {
          q: 'Üye olmadan sipariş verebilir miyim?',
          a: 'Evet. Ödeme sırasında e-posta ve adres bilgilerinizi girmeniz yeterli. Üye olursanız siparişlerinizi, adreslerinizi ve favorilerinizi tek yerden yönetebilirsiniz.',
        },
        {
          q: 'Siparişimi nasıl takip ederim?',
          a: 'Sipariş onayı ve kargo bilgisi e-posta adresinize gönderilir. Üyeyseniz Hesabım → Siparişlerim ekranından siparişinizin durumunu ve kargo takip numarasını görebilirsiniz.',
          link: { href: '/hesap/siparisler', label: 'siparişlerim' },
        },
        {
          q: 'Kurumsal fatura alabilir miyim?',
          a: `Evet. Ödeme sayfasında kurumsal fatura seçeneğini işaretleyip firma unvanı, vergi dairesi ve vergi numaranızı girmeniz yeterli. Faturalarımız ${T.invoice} olarak e-postanıza gönderilir.`,
        },
      ],
    },
    {
      title: 'kargo ve teslimat',
      items: [
        {
          q: 'Siparişim ne zaman kargoya verilir?',
          a: `Stoktaki ürünler ${T.stockDispatchDays}, sipariş üzerine veya kişiye özel üretilen ürünler ${T.madeToOrderDays} içinde kargoya verilir. Kargoya verildikten sonra teslimat genellikle ${ship.transit} sürer.`,
          link: { href: '/kargo-ve-teslimat', label: 'kargo ve teslimat' },
        },
        {
          q: 'Kargo ücreti ne kadar?',
          a: `Kargo ücreti ${ship.fee}. ${ship.freeFrom} ve üzeri siparişlerde kargo ücretsiz.`,
        },
        {
          q: 'Hangi kargo firmalarıyla çalışıyorsunuz? Yurt dışına gönderim var mı?',
          a: `Siparişleri ${T.carriers.join(' ve ')} ile gönderiyoruz. Şu an yalnızca Türkiye içine teslimat yapıyoruz.`,
        },
      ],
    },
    {
      title: 'iade ve değişim',
      items: [
        {
          q: 'Ürünü iade edebilir miyim?',
          a: `Evet. Ürünü teslim aldığınız günden itibaren ${T.withdrawalDays} gün içinde gerekçe göstermeden iade edebilirsiniz. İade kargo ücretini biz karşılarız; ödemeniz talebiniz bize ulaştıktan sonra en geç ${T.refundDays} gün içinde iade edilir.`,
          link: { href: '/iade-politikasi', label: 'iade ve cayma politikası' },
        },
        {
          q: 'Kişiye özel ürünleri iade edebilir miyim?',
          a: 'İsim veya yazı eklenen, sizin gönderdiğiniz dosyayla basılan ya da özel renk/ölçüde üretilen ürünlerde yasal olarak cayma hakkı yoktur. Ancak ürün kusurlu, hasarlı veya siparişinizden farklı geldiyse ücretsiz olarak yeniden üretir, değiştirir ya da ücretini iade ederiz.',
        },
        {
          q: 'Ürünüm hasarlı geldi, ne yapmalıyım?',
          a: `Mümkünse paketi teslim alırken kargo görevlisine hasar tutanağı tutturun. Ardından ürünün ve paketin fotoğraflarıyla, tercihen ${T.damageReportDays} gün içinde, ${COMPANY.email} adresine ya da WhatsApp’tan bize yazın; yenisini hemen hazırlayalım.`,
        },
      ],
    },
    {
      title: 'ürünler',
      items: [
        {
          q: 'Ürünler hangi malzemeden üretiliyor?',
          a: `Ürünlerimizi ${COMPANY.materials.join(' ve ')} ile basıyoruz. PLA bitki kaynaklı bir malzemedir ve dekor ile masaüstü ürünlerinde kullanılır; PETG ısıya, neme ve darbeye daha dayanıklıdır. Her ürünün malzemesi ürün sayfasında yazar.`,
          link: { href: '/uretim-sureci', label: 'üretim süreci' },
        },
        {
          q: 'Üründe ince çizgiler var, bu normal mi?',
          a: '3D baskıda parça katman katman üretildiği için yüzeyde ince katman çizgileri görünür. Bu, üretim yönteminin doğal bir izidir ve kusur sayılmaz. Çatlak, kırık veya eksik parça ise kusurdur; bize bildirin.',
        },
        {
          q: 'Ürünlerin bakımı nasıl yapılır?',
          a: 'Nemli, yumuşak bir bezle silmeniz yeterli. PLA ürünler yaklaşık 50 °C üzerinde yumuşayabileceğinden bulaşık makinesi, sıcak su ve uzun süre doğrudan güneş ışığından uzak tutulmalıdır.',
        },
        {
          q: 'Lambalarla hangi ampulü kullanmalıyım?',
          a: 'Lambalarımızda yalnızca LED ampul kullanın; LED ampuller ısınmadığı için malzemeye zarar vermez. Duy tipi ve önerilen güç her lambanın ürün sayfasında yazar.',
        },
        {
          q: 'zuukids ürünleri çocuklar için uygun mu?',
          a: 'zuukids ürünleri çocuklar düşünülerek tasarlanır; önerilen yaş ve küçük parça uyarıları ürün sayfasında belirtilir. Küçük çocukların oyuncaklarla yetişkin gözetiminde oynamasını öneririz.',
        },
      ],
    },
    {
      title: 'özel üretim ve toptan',
      items: [
        {
          q: 'Kendi tasarımımı bastırabilir miyim?',
          a: `Evet. Modelinizi STL veya 3MF formatında, istediğiniz ölçü, renk ve adetle birlikte ${COMPANY.email} adresine gönderin. Size fiyat ve süre bildiriyoruz; ödeme onayından sonra üretip kargoya veriyoruz.`,
          link: { href: '/ozel-uretim', label: 'özel üretim' },
        },
        {
          q: 'İşletmem için toplu sipariş verebilir miyim?',
          a: `Evet. Kafe, ofis, etkinlik ve kurumsal hediye gibi toplu siparişler için ürün, adet ve teslim tarihini ${COMPANY.email} adresine yazın; size özel teklif hazırlayalım.`,
        },
      ],
    },
  ]

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: groups.flatMap((g) =>
      g.items.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
    ),
  }

  return (
    <CorporatePage slug="sss">
      <JsonLd data={faqJsonLd} />
      <Hero
        eyebrow="zuulab / sss"
        title="sıkça sorulan"
        muted="sorular."
        lead="Sipariş, kargo, iade, ürünler ve özel üretim hakkında en çok sorulanlar. Aradığınızı bulamazsanız bize yazın."
      />

      <Block label="cevaplar" title="merak" muted="edilenler.">
        {groups.map((g) => (
          <div key={g.title} className={s.faqGroup}>
            <h2 className={s.faqGroupTitle}>{g.title}</h2>
            {g.items.map((f) => (
              <details key={f.q} className={s.faq}>
                <summary>{f.q}</summary>
                <div className={s.faqAnswer}>
                  <p>{f.a}</p>
                  {f.link && (
                    <p>
                      <Link href={f.link.href}>{f.link.label} →</Link>
                    </p>
                  )}
                </div>
              </details>
            ))}
          </div>
        ))}
      </Block>

      <CtaBand title="sorunuz burada" muted="yok mu?" text={`${COMPANY.supportHours} arasında telefon ve WhatsApp’tan, her zaman e-postadan ulaşabilirsiniz.`}>
        <Link href="/iletisim" className="btn btn-primary">
          iletişime geç
        </Link>
      </CtaBand>
    </CorporatePage>
  )
}
