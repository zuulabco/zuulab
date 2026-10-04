import type { Metadata } from 'next'
import Link from 'next/link'
import { pageMetadata } from '@/lib/seo/metadata'
import LegalDocument, { SellerTable } from '@/components/legal/LegalDocument'
import { legalDoc } from '@/lib/legal/documents'
import { getShippingTerms } from '@/lib/legal/terms'
import { COMPANY, SALES_TERMS } from '@/config/company'

const doc = legalDoc('on-bilgilendirme-formu')

export const metadata: Metadata = pageMetadata({ title: doc.title, description: doc.summary, path: `/${doc.slug}` })

export default async function PreInformationPage() {
  const ship = await getShippingTerms()
  const T = SALES_TERMS

  return (
    <LegalDocument
      doc={doc}
      intro={
        <p>
          Bu form, Mesafeli Sözleşmeler Yönetmeliği’nin 5. maddesi uyarınca siparişinizi vermeden önce bilmeniz gereken
          bilgileri içerir. Siparişinize özel ürün, adet, fiyat, kargo ve adres bilgileri ödeme sayfasında, bu formun
          altında ayrıca gösterilir.
        </p>
      }
      sections={[
        { id: 'satici', title: 'Satıcı bilgileri', body: <SellerTable /> },
        {
          id: 'urun',
          title: 'Ürünün temel nitelikleri',
          body: (
            <p>
              Ürünlerin malzemesi, ölçüleri, renk ve varyasyon seçenekleri, hazırlık süresi ve diğer özellikleri ilgili ürün
              sayfasında yer alır. Ürünler atölyemizde 3D baskı yöntemiyle üretildiğinden katman çizgileri ve küçük yüzey
              farklılıkları üretim tekniğinin doğal bir sonucudur ve ayıp sayılmaz.
            </p>
          ),
        },
        {
          id: 'fiyat',
          title: 'Fiyat, kargo ve ödeme',
          body: (
            <ul>
              <li>Satış fiyatları Türk lirası cinsinden olup tüm vergiler (KDV) dahildir.</li>
              <li>
                Kargo ücreti {ship.fee}’dir; {ship.freeFrom} ve üzeri siparişlerde kargo ücretsizdir. Toplam tutar, ödemeden önce
                sipariş özetinde gösterilir.
              </li>
              <li>Ödeme yöntemi: {T.paymentMethods.join(', ')}.</li>
              <li>Fatura: {T.invoice}.</li>
            </ul>
          ),
        },
        {
          id: 'teslimat',
          title: 'Teslimat',
          body: (
            <ul>
              <li>Teslimat yalnızca {T.shipsTo} içine, {T.carriers.join(' veya ')} ile yapılır.</li>
              <li>
                Stoktaki ürünler {T.stockDispatchDays}, sipariş üzerine üretilen ürünler {T.madeToOrderDays} içinde kargoya verilir;
                kargo teslim süresi genellikle {ship.transit}.
              </li>
              <li>Teslimat süresi, siparişin onaylanmasından itibaren {T.maxDeliveryDays} günü aşamaz.</li>
            </ul>
          ),
        },
        {
          id: 'cayma',
          title: 'Cayma hakkı',
          body: (
            <>
              <p>
                Ürünü teslim aldığınız günden itibaren <strong>{T.withdrawalDays} gün</strong> içinde gerekçe göstermeden cayma
                hakkınızı kullanabilirsiniz. Cayma bildirimini Hesabım → Siparişlerim ekranından, {COMPANY.email} adresine e-posta
                ile veya {COMPANY.kep} KEP adresine yapabilirsiniz.
              </p>
              <p>
                İade kargo ücretini zuulab karşılar. Ödediğiniz tutar, cayma bildiriminiz bize ulaştıktan sonra en geç{' '}
                {T.refundDays} gün içinde, ödeme yaptığınız yöntemle iade edilir.
              </p>
              <p>
                <strong>Cayma hakkı bulunmayan ürünler:</strong> Gönderdiğiniz model dosyasıyla basılan, kişiselleştirilen (isim,
                yazı, plaka, logo) veya isteğinize göre özel renk/ölçüde üretilen ürünler. Bu ürünlerde kusur veya siparişe
                aykırılık varsa yasal haklarınız saklıdır.
              </p>
            </>
          ),
        },
        {
          id: 'garanti',
          title: 'Ayıplı mal ve şikâyetler',
          body: (
            <>
              <p>
                Ayıplı ürünlerde 6502 sayılı Kanun kapsamındaki seçimlik haklarınızı (sözleşmeden dönme, bedel indirimi, ücretsiz
                onarım, değişim) teslimden itibaren {T.warrantyYears} yıl içinde kullanabilirsiniz.
              </p>
              <p>
                Şikâyetlerinizi {COMPANY.email} adresine veya {COMPANY.phoneDisplay} numarasına ({COMPANY.supportHours})
                iletebilirsiniz. Uyuşmazlıklarda, Ticaret Bakanlığınca belirlenen parasal sınırlar dahilinde tüketici hakem
                heyetlerine veya tüketici mahkemelerine başvurabilirsiniz.
              </p>
            </>
          ),
        },
        {
          id: 'onay',
          title: 'Onay',
          body: (
            <p>
              Ödeme adımında bu formu ve <Link href="/mesafeli-satis-sozlesmesi">mesafeli satış sözleşmesini</Link> onaylamanız,
              siparişinizle ilgili bu bilgileri okuduğunuzu ve kabul ettiğinizi gösterir.
            </p>
          ),
        },
      ]}
    />
  )
}
