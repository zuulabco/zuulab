import type { Metadata } from 'next'
import Link from 'next/link'
import { pageMetadata } from '@/lib/seo/metadata'
import LegalDocument, { KeyValue, Summary } from '@/components/legal/LegalDocument'
import { legalDoc } from '@/lib/legal/documents'
import { COMPANY, SALES_TERMS } from '@/config/company'

const doc = legalDoc('iade-politikasi')

export const metadata: Metadata = pageMetadata({ title: doc.title, description: doc.summary, path: `/${doc.slug}` })

export default function ReturnPolicyPage() {
  const T = SALES_TERMS

  return (
    <LegalDocument
      doc={doc}
      intro={
        <Summary
          items={[
            <>Teslimden itibaren <strong>{T.withdrawalDays} gün</strong> içinde gerekçesiz iade.</>,
            <>İade kargo ücreti <strong>bizden</strong>; size anlaşmalı kargo kodu veriyoruz.</>,
            <>Para iadesi, talebiniz bize ulaştıktan sonra <strong>en geç {T.refundDays} gün</strong> içinde.</>,
            <>Kişiye özel üretilen ürünlerde iade yok; kusurlu veya yanlış gönderimde yasal haklarınız geçerli.</>,
          ]}
        />
      }
      sections={[
        {
          id: 'cayma',
          title: 'Cayma hakkı',
          body: (
            <p>
              Satın aldığınız ürünü teslim aldığınız günden itibaren {T.withdrawalDays} gün içinde, herhangi bir gerekçe
              göstermeden ve cezai şart ödemeden iade edebilirsiniz. Birden fazla ürün ayrı ayrı teslim edildiyse süre son ürünün
              teslimiyle başlar.
            </p>
          ),
        },
        {
          id: 'nasil',
          title: 'İade nasıl yapılır?',
          body: (
            <ol>
              <li>
                <strong>Hesabım → Siparişlerim</strong> ekranından teslim edilen siparişinizi seçip &quot;İade talebi oluştur&quot;a
                basın ve iade nedeninizi yazın. Üye değilseniz <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> adresine
                sipariş numaranızla yazmanız yeterlidir.
              </li>
              <li>Talebiniz onaylandığında size ücretsiz iade kargo kodu gönderiyoruz.</li>
              <li>
                Ürünü, mümkünse orijinal ambalajında ve tüm parçalarıyla paketleyip kodla birlikte {T.carriers.join(' veya ')}{' '}
                şubesine teslim edin. Bildiriminizden itibaren 10 gün içinde kargoya vermeniz gerekir.
              </li>
              <li>Ürün atölyemize ulaşıp kontrol edildikten sonra ödemeniz iade edilir.</li>
            </ol>
          ),
        },
        {
          id: 'para-iadesi',
          title: 'Para iadesi',
          body: (
            <p>
              Ödediğiniz tutarın tamamı (ilk gönderimin kargo ücreti dahil), cayma bildiriminiz bize ulaştıktan sonra en geç{' '}
              {T.refundDays} gün içinde, ödeme yaptığınız kart veya yöntemle iade edilir. Tutarın kartınıza yansıma süresi
              bankanıza bağlıdır.
            </p>
          ),
        },
        {
          id: 'istisnalar',
          title: 'İade edilemeyen ürünler',
          body: (
            <>
              <p>Aşağıdaki ürünler kişiye özel hazırlandığı için cayma hakkı kapsamında değildir:</p>
              <ul>
                <li>Gönderdiğiniz model dosyasıyla (STL, 3MF vb.) basılan ürünler,</li>
                <li>İsim, yazı, plaka, logo gibi kişiselleştirme yapılan ürünler,</li>
                <li>İsteğiniz üzerine özel renk, ölçü veya malzemede üretilen ürünler.</li>
              </ul>
              <p>
                Bu ürünler bizden kaynaklı bir sebeple <strong>kusurlu, hasarlı veya siparişe aykırı</strong> (yanlış ürün, ölçü
                veya renk) ulaştıysa ücretsiz olarak yeniden üretir, değiştirir ya da ücretini iade ederiz.
              </p>
            </>
          ),
        },
        {
          id: 'hasarli',
          title: 'Hasarlı veya kusurlu ürün',
          body: (
            <>
              <p>
                Teslim sırasında paketi kontrol etmenizi, hasarlı paketi teslim almadan kargo görevlisine tutanak tutturmanızı
                öneririz. Hasarı veya kusuru teslimattan sonra en kısa sürede, mümkünse {T.damageReportDays} gün içinde
                fotoğraflarıyla bize iletirseniz süreci çok daha hızlı çözeriz. Bu rica yasal haklarınızı kısıtlamaz.
              </p>
              <p>
                Ayıplı ürünlerde teslimden itibaren {T.warrantyYears} yıl boyunca; ücretsiz onarım, ayıpsız ürünle değişim, bedel
                indirimi veya sözleşmeden dönme haklarından birini seçebilirsiniz.
              </p>
            </>
          ),
        },
        {
          id: 'adres',
          title: 'İade adresi',
          body: (
            <>
              <p>İade kargo kodunuzla gönderim yaptığınızda adres otomatik olarak doldurulur. Kendi gönderimlerinizde:</p>
              <KeyValue
                rows={[
                  ['Alıcı', COMPANY.tradeName],
                  ['Adres', COMPANY.returnAddress],
                  ['Telefon', COMPANY.phoneDisplay],
                ]}
              />
              <p>
                Ayrıntılar <Link href="/mesafeli-satis-sozlesmesi#cayma-hakki">mesafeli satış sözleşmesinin</Link> cayma hakkı
                bölümündedir.
              </p>
            </>
          ),
        },
      ]}
    />
  )
}
