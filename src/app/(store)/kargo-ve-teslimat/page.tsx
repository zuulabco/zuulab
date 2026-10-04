import type { Metadata } from 'next'
import Link from 'next/link'
import { pageMetadata } from '@/lib/seo/metadata'
import { getShippingTerms } from '@/lib/legal/terms'
import { SALES_TERMS } from '@/config/company'
import { Block, CorporatePage, CtaBand, Facts, Features, Hero } from '@/components/content/Corporate'

export const metadata: Metadata = pageMetadata({
  title: 'Kargo ve teslimat',
  description:
    'zuulab kargo ve teslimat: stoktaki ürünler 1–3, özel üretim 2–5 iş gününde kargoda. Sürat Kargo ve PTT Kargo ile Türkiye geneline gönderim, ücretsiz kargo sınırı.',
  path: '/kargo-ve-teslimat',
})

export default async function ShippingPage() {
  const ship = await getShippingTerms()
  const T = SALES_TERMS

  return (
    <CorporatePage slug="kargo-ve-teslimat">
      <Hero
        eyebrow="zuulab / kargo ve teslimat"
        title="atölyeden çıkış,"
        muted="kapınıza varış."
        lead="Siparişinizin ne zaman hazırlanacağını, hangi kargoyla geleceğini ve ne kadar tutacağını burada bulabilirsiniz."
      >
        <Facts
          items={[
            { value: T.stockDispatchDays.replace(' iş günü', ''), label: 'stoktaki ürün (iş günü)' },
            { value: T.madeToOrderDays.replace(' iş günü', ''), label: 'özel üretim (iş günü)' },
            { value: ship.fee, label: 'kargo ücreti' },
            { value: ship.freeFrom, label: 've üzeri ücretsiz' },
          ]}
        />
      </Hero>

      <Block label="süreler" title="ne zaman" muted="kargoda?">
        <Features
          items={[
            {
              title: 'stoktaki ürünler',
              text: `Ödemeniz onaylandıktan sonra ${T.stockDispatchDays} içinde paketlenip kargoya verilir.`,
            },
            {
              title: 'sipariş üzerine ve kişiye özel',
              text: `Sizin için basılan, isim/yazı eklenen veya özel renkte üretilen ürünler ${T.madeToOrderDays} içinde hazırlanır. Hazırlık süresi her ürün sayfasında yazar.`,
            },
            {
              title: 'kargo süresi',
              text: `Kargoya verildikten sonra teslimat genellikle ${ship.transit} sürer; bölgeye göre değişebilir.`,
            },
            {
              title: 'yasal üst sınır',
              text: `Her durumda siparişiniz onay tarihinden itibaren en geç ${T.maxDeliveryDays} gün içinde teslim edilir.`,
            },
          ]}
        />
      </Block>

      <Block label="gönderim" title="kargo ve" muted="ücretler." tone="tinted">
        <Features
          items={[
            { title: 'kargo firmaları', text: `${T.carriers.join(' ve ')}. Siparişiniz adresinize en uygun firmayla gönderilir.` },
            { title: 'kargo ücreti', text: `${ship.fee}; ${ship.freeFrom} ve üzeri siparişlerde ücretsiz. Toplam tutar ödeme öncesinde gösterilir.` },
            { title: 'teslimat bölgesi', text: `Yalnızca ${T.shipsTo} içindeki adreslere gönderim yapıyoruz.` },
            {
              title: 'takip',
              text: 'Kargo takip numaranız e-postanıza gönderilir; üyeyseniz Hesabım → Siparişlerim ekranından da görebilirsiniz.',
            },
          ]}
        />
      </Block>

      <Block label="teslim alırken" title="dikkat" muted="edilecekler.">
        <Features
          items={[
            {
              title: 'paketi kontrol edin',
              text: 'Ezik, ıslak veya yırtık bir paket görürseniz teslim almadan kargo görevlisine hasar tutanağı tutturun.',
            },
            {
              title: 'hasarı bize bildirin',
              text: (
                <p>
                  Ürün hasarlı çıktıysa fotoğraflarıyla, tercihen {T.damageReportDays} gün içinde bize yazın; yenisini hazırlayalım.
                  Ayrıntılar <Link href="/iade-politikasi">iade ve cayma politikasında</Link>.
                </p>
              ),
            },
            {
              title: 'adreste bulunamazsanız',
              text: 'Kargo firması bir sonraki iş günü yeniden dener ya da paketi size en yakın şubede bekletir; bilgilendirme SMS’ini takip edin.',
            },
            {
              title: 'adres değişikliği',
              text: 'Siparişiniz kargoya verilmeden önce bize yazarsanız teslimat adresini güncelleyebiliriz.',
            },
          ]}
        />
      </Block>

      <CtaBand title="siparişiniz" muted="nerede?" text="Takip numaranızı Hesabım → Siparişlerim ekranında bulabilir ya da bize sorabilirsiniz.">
        <Link href="/hesap/siparisler" className="btn btn-primary">
          siparişlerim
        </Link>
        <Link href="/iletisim" className="btn btn-secondary">
          bize ulaşın
        </Link>
      </CtaBand>
    </CorporatePage>
  )
}
