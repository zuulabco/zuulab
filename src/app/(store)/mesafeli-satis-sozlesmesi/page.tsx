import type { Metadata } from 'next'
import Link from 'next/link'
import { pageMetadata } from '@/lib/seo/metadata'
import LegalDocument, { SellerTable } from '@/components/legal/LegalDocument'
import { legalDoc } from '@/lib/legal/documents'
import { getShippingTerms } from '@/lib/legal/terms'
import { COMPANY, SALES_TERMS } from '@/config/company'

const doc = legalDoc('mesafeli-satis-sozlesmesi')

export const metadata: Metadata = pageMetadata({ title: doc.title, description: doc.summary, path: `/${doc.slug}` })

export default async function DistanceSalesContractPage() {
  const ship = await getShippingTerms()
  const T = SALES_TERMS

  return (
    <LegalDocument
      doc={doc}
      intro={
        <p>
          Bu sözleşme, www.zuulab.com üzerinden verdiğiniz siparişle, ödeme adımında elektronik ortamda onaylamanız üzerine
          kurulur. Siparişinize ait ürün, adet, fiyat ve teslimat bilgileri ödeme sayfasındaki sipariş özetinde ve size
          gönderilen sipariş onayı e-postasında yer alır; bunlar sözleşmenin ayrılmaz parçasıdır.
        </p>
      }
      sections={[
        {
          id: 'taraflar',
          title: 'Taraflar',
          body: (
            <>
              <h3>Satıcı</h3>
              <SellerTable />
              <h3>Alıcı</h3>
              <p>
                Siparişi veren ve ödeme sayfasında ad soyad, teslimat ve fatura adresi, e-posta ve telefon bilgilerini
                beyan eden kişidir (bundan sonra &quot;Alıcı&quot;). Alıcı, verdiği bilgilerin doğru ve güncel olduğunu kabul eder.
              </p>
            </>
          ),
        },
        {
          id: 'konu',
          title: 'Sözleşmenin konusu',
          body: (
            <p>
              Bu sözleşmenin konusu, Alıcının Satıcıya ait internet sitesinden elektronik ortamda siparişini verdiği
              ürünlerin satışı ve teslimine ilişkin olarak 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli
              Sözleşmeler Yönetmeliği hükümleri uyarınca tarafların hak ve yükümlülüklerinin belirlenmesidir.
            </p>
          ),
        },
        {
          id: 'urun-fiyat',
          title: 'Ürün, fiyat ve ödeme',
          body: (
            <>
              <p>
                Ürünlerin temel nitelikleri (malzeme, ölçü, renk, varyasyon), adedi ve satış fiyatı ilgili ürün sayfasında
                ve sipariş özetinde gösterilir. Tüm fiyatlar Türk lirası cinsindendir ve KDV dahildir.
              </p>
              <ul>
                <li>
                  <strong>Kargo ücreti:</strong> {ship.fee}. {ship.freeFrom} ve üzeri siparişlerde kargo ücretsizdir. Uygulanan
                  kargo ücreti sipariş özetinde ayrıca gösterilir.
                </li>
                <li>
                  <strong>Ödeme:</strong> {T.paymentMethods.join(', ')}. Kart bilgileri Satıcı tarafından görülmez ve saklanmaz.
                </li>
                <li>
                  <strong>Fatura:</strong> Siparişin faturası {T.invoice} olarak düzenlenir ve Alıcının e-posta adresine gönderilir.
                </li>
              </ul>
              <p>
                Ürün sayfasındaki fiyat, sipariş anında geçerli olan fiyattır. Sitede açıkça hatalı bir fiyat (örneğin yazım
                hatası) gösterilmişse Satıcı siparişi onaylamadan önce durumu Alıcıya bildirir; Alıcı dilerse siparişi iptal eder
                ve ödediği tutar eksiksiz iade edilir.
              </p>
            </>
          ),
        },
        {
          id: 'teslimat',
          title: 'Teslimat',
          body: (
            <>
              <ul>
                <li>Teslimat yalnızca {T.shipsTo} içindeki adreslere yapılır.</li>
                <li>Siparişler {T.carriers.join(' veya ')} ile gönderilir.</li>
                <li>
                  Stokta bulunan ürünler ödemenin onaylanmasından itibaren {T.stockDispatchDays} içinde, kişiye özel veya sipariş
                  üzerine üretilen ürünler {T.madeToOrderDays} içinde kargoya verilir. Kargoya verildikten sonra teslimat
                  genellikle {ship.transit} sürer.
                </li>
                <li>
                  Teslimat, her durumda siparişin onaylanmasından itibaren yasal süre olan {T.maxDeliveryDays} günü aşamaz. Bu süre
                  içinde teslim edilemeyen siparişlerde Alıcı sözleşmeyi feshedebilir.
                </li>
                <li>
                  Ürün, Alıcının sipariş sırasında belirttiği adrese ve kişiye teslim edilir. Alıcı dışındaki bir kişiye yapılan
                  teslim, Alıcıya yapılmış sayılır.
                </li>
                <li>
                  Alıcının teslim sırasında paketi kontrol etmesi, hasarlı paketi teslim almayıp kargo görevlisine tutanak
                  tutturması ve durumu bize iletmesi önerilir.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'satici-yukumlulukleri',
          title: 'Satıcının yükümlülükleri',
          body: (
            <ul>
              <li>Ürünü siparişte belirtilen niteliklere uygun, sağlam ve eksiksiz olarak teslim etmek.</li>
              <li>
                Siparişin, stok tükenmesi veya üretimin mümkün olmaması gibi bir sebeple yerine getirilememesi halinde bunu
                öğrendiği tarihten itibaren 3 gün içinde Alıcıya bildirmek ve ödenen tutarı en geç 14 gün içinde iade etmek.
              </li>
              <li>Cayma hakkının kullanılması halinde ödenen tutarı 7. maddede belirtilen sürede iade etmek.</li>
            </ul>
          ),
        },
        {
          id: 'alici-yukumlulukleri',
          title: 'Alıcının yükümlülükleri',
          body: (
            <ul>
              <li>Sipariş sırasında doğru ve eksiksiz bilgi vermek.</li>
              <li>Ön bilgilendirme formunu ve bu sözleşmeyi okuyup onayladıktan sonra siparişi tamamlamak.</li>
              <li>
                Kişiye özel üretim siparişlerinde Satıcıya gönderdiği model dosyalarının (STL, 3MF vb.) ve tasarımların
                kullanım hakkına sahip olmak; üçüncü kişilerin fikri mülkiyet haklarını ihlal etmemek.
              </li>
            </ul>
          ),
        },
        {
          id: 'cayma-hakki',
          title: 'Cayma hakkı',
          body: (
            <>
              <p>
                Alıcı, ürünü teslim aldığı günden itibaren <strong>{T.withdrawalDays} gün</strong> içinde herhangi bir gerekçe
                göstermeksizin ve cezai şart ödemeksizin sözleşmeden cayabilir. Birden fazla ürünün ayrı ayrı teslim edildiği
                siparişlerde süre son ürünün teslimiyle başlar.
              </p>
              <ul>
                <li>
                  Cayma bildirimi; Hesabım → Siparişlerim ekranındaki iade talebi ile, <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>{' '}
                  adresine e-posta ile veya KEP adresimize ({COMPANY.kep}) yapılabilir.
                </li>
                <li>
                  Alıcı, cayma bildiriminden itibaren 10 gün içinde ürünü iade eder. İade kargo ücreti{' '}
                  {T.freeReturns ? 'Satıcı tarafından karşılanır; iade için size anlaşmalı kargo kodu verilir' : 'Alıcıya aittir'}.
                </li>
                <li>
                  Satıcı, cayma bildiriminin kendisine ulaşmasından itibaren en geç <strong>{T.refundDays} gün</strong> içinde,
                  teslimat masrafları dahil tahsil edilen tüm tutarı, ödemenin yapıldığı yöntemle iade eder.
                </li>
                <li>
                  Ürünün olağan kullanımı dışında kullanılması ya da özensiz kullanım sonucu oluşan değer kaybından Alıcı
                  sorumludur.
                </li>
              </ul>
              <p>
                Ayrıntılar ve adım adım iade süreci için <Link href="/iade-politikasi">iade ve cayma politikası</Link> sayfasına
                bakabilirsiniz.
              </p>
            </>
          ),
        },
        {
          id: 'cayma-istisnalari',
          title: 'Cayma hakkının kullanılamayacağı durumlar',
          body: (
            <>
              <p>
                Mesafeli Sözleşmeler Yönetmeliği’nin 15. maddesi uyarınca, Alıcının istekleri veya kişisel ihtiyaçları
                doğrultusunda hazırlanan ürünlerde cayma hakkı kullanılamaz. Bunlar özellikle şunlardır:
              </p>
              <ul>
                <li>Alıcının gönderdiği model dosyasıyla (STL, 3MF vb.) basılan ürünler,</li>
                <li>İsim, yazı, plaka, logo gibi kişiselleştirme yapılan ürünler,</li>
                <li>Alıcının talebiyle özel renk, ölçü veya malzemede üretilen ürünler.</li>
              </ul>
              <p>
                Bu ürünler kusurlu, hasarlı veya siparişe aykırı (yanlış ürün, yanlış ölçü/renk) teslim edilmişse Alıcının
                ayıplı mala ilişkin hakları saklıdır.
              </p>
            </>
          ),
        },
        {
          id: 'ayipli-mal',
          title: 'Ayıplı mal ve garanti',
          body: (
            <>
              <p>
                Satıcı, ürünlerin ayıpsız teslim edilmesinden sorumludur. Ayıplı mallarda Alıcı, 6502 sayılı Kanun’un 11.
                maddesi uyarınca; sözleşmeden dönme, ayıp oranında bedel indirimi, ücretsiz onarım veya ayıpsız bir misli ile
                değişim haklarından birini seçebilir.
              </p>
              <p>
                Ayıplı mala ilişkin sorumluluk süresi teslimden itibaren <strong>{T.warrantyYears} yıldır</strong>. Aydınlatma
                ürünlerinin elektrik aksamı dahil tüm ürünler bu süre boyunca güvence altındadır.
              </p>
              <p>
                Kargo kaynaklı hasarların hızlı çözülebilmesi için hasarı teslimattan sonra en kısa sürede, mümkünse{' '}
                {T.damageReportDays} gün içinde fotoğraflarıyla bize bildirmenizi rica ederiz. Bu rica, yasal haklarınızı
                kısıtlamaz.
              </p>
            </>
          ),
        },
        {
          id: 'kisisel-veriler',
          title: 'Kişisel veriler',
          body: (
            <p>
              Alıcının kişisel verileri, siparişin yerine getirilmesi ve yasal yükümlülükler için{' '}
              <Link href="/kvkk-aydinlatma-metni">KVKK aydınlatma metninde</Link> açıklandığı şekilde işlenir.
            </p>
          ),
        },
        {
          id: 'uyusmazlik',
          title: 'Şikâyet ve uyuşmazlıkların çözümü',
          body: (
            <>
              <p>
                Şikâyetlerinizi öncelikle <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> adresine veya{' '}
                {COMPANY.phoneDisplay} numaralı telefona ({COMPANY.supportHours}) iletebilirsiniz.
              </p>
              <p>
                Uyuşmazlıklarda, Ticaret Bakanlığınca her yıl ilan edilen parasal sınırlar dahilinde Alıcının veya Satıcının
                yerleşim yerindeki tüketici hakem heyetlerine, bu sınırları aşan durumlarda tüketici mahkemelerine
                başvurulabilir. Başvurular e-Devlet üzerinden Tüketici Bilgi Sistemi (TÜBİS) ile de yapılabilir.
              </p>
            </>
          ),
        },
        {
          id: 'yururluk',
          title: 'Yürürlük',
          body: (
            <p>
              Alıcı, ödeme adımında bu sözleşmeyi ve <Link href="/on-bilgilendirme-formu">ön bilgilendirme formunu</Link> okuyup
              onayladığında sözleşme kurulmuş olur. Sözleşme metni ve sipariş bilgileri Satıcı tarafından saklanır ve sipariş
              onayı e-postasıyla Alıcıya iletilir.
            </p>
          ),
        },
      ]}
    />
  )
}
