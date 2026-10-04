import type { Metadata } from 'next'
import Link from 'next/link'
import { pageMetadata } from '@/lib/seo/metadata'
import { COMPANY, SALES_TERMS } from '@/config/company'
import { Block, CorporatePage, CtaBand, Facts, Features, Hero, Steps } from '@/components/content/Corporate'

export const metadata: Metadata = pageMetadata({
  title: 'Üretim süreci',
  description:
    'Bir zuulab ürününün 5 adımlık yolculuğu: tasarım, dilimleme, Bambu Lab yazıcılarda PLA/PETG baskı, kalite kontrol ve paketleme.',
  path: '/uretim-sureci',
})

const printerCount = COMPANY.printers.reduce((n, p) => n + p.count, 0)

export default function ProductionPage() {
  return (
    <CorporatePage slug="uretim-sureci">
      <Hero
        eyebrow="zuulab / üretim süreci"
        title="fikirden elinize,"
        muted="beş adım."
        lead="Her zuulab ürünü Bolu’daki atölyemizde, siparişe göre ya da küçük partiler halinde üretilir. İşte bir parçanın tasarımdan kapınıza yolculuğu."
      >
        <Facts
          items={[
            { value: String(printerCount), label: '3d yazıcı' },
            { value: COMPANY.materials.join(' · '), label: 'malzeme' },
            { value: SALES_TERMS.stockDispatchDays.replace(' iş günü', ''), label: 'stoktan kargoya (iş günü)' },
            { value: SALES_TERMS.madeToOrderDays.replace(' iş günü', ''), label: 'özel üretim (iş günü)' },
          ]}
        />
      </Hero>

      <Block label="süreç" title="bir parçanın" muted="yolculuğu.">
        <Steps
          items={[
            {
              title: 'tasarım',
              text: 'Ürünlerimizi bilgisayarda modelliyor, ilk örneği basıp gerçek kullanımda deniyoruz; ölçüsü, dengesi ve dokusu oturana kadar düzeltiyoruz. Özel üretimde gönderdiğiniz dosyayı ölçek, et kalınlığı ve baskıya uygunluk açısından kontrol ediyoruz.',
            },
            {
              title: 'dilimleme ve hazırlık',
              text: 'Model, yazıcının anlayacağı katmanlara bölünür. Baskı yönü, doluluk oranı, destek yapısı ve katman yüksekliği her ürün için ayrı ayarlanır; sağlamlık ile yüzey kalitesi arasında en iyi dengeyi ararız.',
            },
            {
              title: 'baskı',
              text: `Parça, Bambu Lab yazıcılarımızda seçilen malzeme ve renkle katman katman basılır. Ürünün boyutuna göre bir baskı birkaç saatten bir güne kadar sürebilir.`,
            },
            {
              title: 'son işlem ve kontrol',
              text: 'Destekler temizlenir, yüzey ve ölçüler kontrol edilir, parçalı ürünler monte edilip denenir. Lambalarda elektrik aksamı takılıp çalıştırılarak test edilir. Kusurlu parça yeniden basılır.',
            },
            {
              title: 'paketleme ve kargo',
              text: `Ürün koruyucu ambalajla paketlenir ve ${SALES_TERMS.carriers.join(' veya ')} ile yola çıkar. Stoktaki ürünler ${SALES_TERMS.stockDispatchDays}, sipariş üzerine üretilenler ${SALES_TERMS.madeToOrderDays} içinde kargoya verilir.`,
            },
          ]}
        />
      </Block>

      <Block label="atölye" title="makineler ve" muted="malzemeler." tone="tinted">
        <Features
          items={[
            {
              title: 'yazıcılarımız',
              text: (
                <p>
                  {COMPANY.printers.map((p) => `${p.count} × ${p.model}`).join(', ')}. Hızlı, hassas ve otomatik kalibrasyonlu
                  FDM yazıcılar; aynı anda farklı ürünleri basabilmemizi sağlar.
                </p>
              ),
            },
            {
              title: 'PLA',
              text: 'Mısır nişastası gibi bitki kaynaklı hammaddelerden üretilen, kokusuz ve renk seçeneği bol bir malzeme. Dekor, lamba ve masaüstü ürünlerinde kullanırız. Yüksek sıcaklıktan (yaklaşık 50 °C üzeri) uzak tutulmalıdır.',
            },
            {
              title: 'PETG',
              text: 'PLA’ya göre darbeye, ısıya ve neme daha dayanıklıdır. Daha sağlam olması gereken, sık kullanılan veya mutfak/banyo gibi ortamlardaki parçalarda tercih ederiz.',
            },
            {
              title: 'yakında',
              text: 'Farklı doku ve dayanımdaki yeni malzemeleri deniyoruz; uygun olanları koleksiyonlarımıza ekledikçe ürün sayfalarında belirteceğiz.',
            },
          ]}
        />
      </Block>

      <Block label="bilmekte fayda var" title="3d baskının" muted="doğası.">
        <Features
          items={[
            {
              title: 'katman dokusu',
              text: 'Yakından bakıldığında yüzeyde ince katman çizgileri görünür. Bu, üretim yönteminin doğal bir izidir ve her parçaya kendine özgü bir doku verir.',
            },
            {
              title: 'renk tonları',
              text: 'Filament partileri ve ekran ayarları nedeniyle renk tonu fotoğraftan küçük farklılık gösterebilir.',
            },
            {
              title: 'bakım',
              text: 'Nemli, yumuşak bir bezle silin. Bulaşık makinesi, sıcak su ve uzun süre doğrudan güneş ışığından uzak tutun.',
            },
            {
              title: 'kişiye özel',
              text: (
                <p>
                  Kendi modelinizi bastırmak isterseniz <Link href="/ozel-uretim">özel üretim</Link> sayfamıza göz atın.
                </p>
              ),
            },
          ]}
        />
      </Block>

      <CtaBand title="atölyeden" muted="kapınıza." text="Koleksiyonlarımızı keşfedin ya da sorularınız için bize yazın.">
        <Link href="/urunler" className="btn btn-primary">
          ürünleri incele
        </Link>
        <Link href="/sss" className="btn btn-secondary">
          sıkça sorulanlar
        </Link>
      </CtaBand>
    </CorporatePage>
  )
}
