import type { Metadata } from 'next'
import Link from 'next/link'
import { pageMetadata } from '@/lib/seo/metadata'
import { COMPANY, SALES_TERMS } from '@/config/company'
import { Block, CorporatePage, CtaBand, Features, Hero, Steps } from '@/components/content/Corporate'

export const metadata: Metadata = pageMetadata({
  title: 'Özel üretim ve toptan sipariş',
  description:
    'Kendi STL veya 3MF modelinizi bastırın: Bolu’daki atölyemizde PLA/PETG ile 3D baskı, Türkiye geneline kargo. İşletmeler için toplu ve logolu ürün siparişi.',
  path: '/ozel-uretim',
})

const MAIL_CUSTOM = `mailto:${COMPANY.email}?subject=${encodeURIComponent('Özel üretim talebi')}&body=${encodeURIComponent(
  'Merhaba zuulab,\n\nModel dosyamı ekte gönderiyorum.\n\nÖlçü / ölçek:\nAdet:\nRenk:\nMalzeme (PLA / PETG / bilmiyorum):\nKullanım amacı:\nTeslimat ili:\n'
)}`
const MAIL_WHOLESALE = `mailto:${COMPANY.email}?subject=${encodeURIComponent('Toptan sipariş talebi')}&body=${encodeURIComponent(
  'Merhaba zuulab,\n\nFirma adı:\nİstediğimiz ürün(ler):\nAdet:\nLogo / kişiselleştirme:\nİstenen teslim tarihi:\nİletişim telefonu:\n'
)}`

export default function CustomProductionPage() {
  return (
    <CorporatePage slug="ozel-uretim">
      <Hero
        eyebrow="zuulab / özel üretim"
        title="sizin modeliniz,"
        muted="bizim atölyemiz."
        lead="Elinizde bir 3D model varsa biz basıp kapınıza gönderelim. İşletmeniz için toplu veya logolu ürün siparişlerini de aynı özenle hazırlıyoruz."
      />

      <Block label="kişiye özel baskı" title="beş adımda" muted="sizin parçanız." intro="Dosyanızı STL veya 3MF formatında göndermeniz yeterli.">
        <Steps
          items={[
            {
              title: 'dosyanızı gönderin',
              text: (
                <p>
                  Modelinizi <a href={MAIL_CUSTOM}>{COMPANY.email}</a> adresine STL veya 3MF olarak gönderin; ölçü, adet, renk ve
                  kullanım amacını yazın.
                </p>
              ),
            },
            {
              title: 'inceleyip fiyat verelim',
              text: 'Dosyanın baskıya uygunluğunu kontrol eder, gerekirse ölçek veya malzeme önerir; fiyat ve üretim süresini size iletiriz.',
            },
            { title: 'ödeme', text: 'Teklifi onaylamanızın ardından ödemeyi alır, üretime başlarız.', meta: 'ödeme üretimden önce alınır' },
            {
              title: 'üretim ve kontrol',
              text: `Parçanız ${COMPANY.materials.join(' veya ')} ile basılır, temizlenir ve kontrol edilir.`,
              meta: `${SALES_TERMS.madeToOrderDays} (adet ve boyuta göre)`,
            },
            { title: 'kargo', text: `${SALES_TERMS.carriers.join(' veya ')} ile adresinize gönderilir; takip numarası e-postanıza gelir.` },
          ]}
        />
      </Block>

      <Block label="toptan ve kurumsal" title="işletmeniz" muted="için." tone="tinted">
        <Features
          items={[
            {
              title: 'kimler için?',
              text: 'Kafe ve restoranlar (QR stantları, masa numaraları), ofisler (masaüstü düzenleyiciler), mağazalar, etkinlikler ve kurumsal hediyeler.',
            },
            {
              title: 'neler yapabiliriz?',
              text: 'Koleksiyonlarımızdaki ürünleri toplu adette, size özel renkte veya logolu/isimli olarak üretebiliriz.',
            },
            {
              title: 'nasıl teklif alınır?',
              text: (
                <p>
                  Ürün, adet ve teslim tarihini <a href={MAIL_WHOLESALE}>{COMPANY.email}</a> adresine yazın; size özel fiyat
                  teklifi hazırlayalım. Kurumsal fatura düzenliyoruz.
                </p>
              ),
            },
            {
              title: 'zuutoptan',
              text: (
                <p>
                  Kurumsal ürünlerimize <Link href="/koleksiyon/zuutoptan">zuutoptan koleksiyonundan</Link> göz atabilirsiniz.
                </p>
              ),
            },
          ]}
        />
      </Block>

      <Block label="bilmeniz gerekenler" title="önemli" muted="notlar.">
        <Features
          items={[
            {
              title: 'cayma hakkı',
              text: (
                <p>
                  Kişiye özel üretilen ürünlerde yasal olarak cayma hakkı yoktur. Ürün bizden kaynaklı bir kusurla veya siparişe
                  aykırı gelirse ücretsiz yeniden üretiriz. <Link href="/iade-politikasi">İade politikası</Link>
                </p>
              ),
            },
            {
              title: 'dosya hakları',
              text: (
                <p>
                  Dosyanızın hakları size aittir ve yalnızca siparişiniz için kullanılır. Başkasına ait tasarımları basmadan önce
                  kullanım hakkınız olduğundan emin olun. <Link href="/kullanim-kosullari#fikri-mulkiyet">Kullanım koşulları</Link>
                </p>
              ),
            },
            { title: 'dosyanız yok mu?', text: 'Fikrinizi, ölçülerinizi ve varsa çiziminizi gönderin; modelleme yapıp yapamayacağımızı birlikte değerlendirelim.' },
            { title: 'malzeme', text: 'PLA dekoratif parçalar için, PETG ısıya ve darbeye dayanım gereken parçalar için uygundur; emin değilseniz biz önerelim.' },
          ]}
        />
      </Block>

      <CtaBand title="dosyanız" muted="hazır mı?" text={`${COMPANY.email} adresine gönderin ya da WhatsApp’tan yazın.`}>
        <a href={MAIL_CUSTOM} className="btn btn-primary">
          e-posta ile gönder
        </a>
        <a href={`https://wa.me/${COMPANY.phoneE164.replace(/\D/g, '')}`} className="btn btn-secondary" target="_blank" rel="noopener noreferrer">
          whatsapp
        </a>
      </CtaBand>
    </CorporatePage>
  )
}
