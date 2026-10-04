import type { Metadata } from 'next'
import Link from 'next/link'
import { pageMetadata } from '@/lib/seo/metadata'
import LegalDocument from '@/components/legal/LegalDocument'
import { legalDoc } from '@/lib/legal/documents'
import { COMPANY } from '@/config/company'

const doc = legalDoc('kullanim-kosullari')

export const metadata: Metadata = pageMetadata({ title: doc.title, description: doc.summary, path: `/${doc.slug}` })

export default function TermsOfUsePage() {
  return (
    <LegalDocument
      doc={doc}
      intro={
        <p>
          www.zuulab.com {COMPANY.tradeName} tarafından işletilir. Siteyi kullanarak bu koşulları kabul etmiş olursunuz.
          Satın alımlarınız ayrıca <Link href="/mesafeli-satis-sozlesmesi">mesafeli satış sözleşmesine</Link> tabidir.
        </p>
      }
      sections={[
        {
          id: 'uyelik',
          title: 'Üyelik',
          body: (
            <ul>
              <li>Alışveriş yapmak için 18 yaşını doldurmuş olmanız gerekir. Üye olmadan da sipariş verebilirsiniz.</li>
              <li>Üyelik bilgilerinizin doğru ve güncel olmasından siz sorumlusunuz.</li>
              <li>Hesabınızın güvenliğini korumak ve şifrenizi kimseyle paylaşmamak sizin sorumluluğunuzdadır.</li>
              <li>
                Hesabınızı kapatmak isterseniz <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> adresine yazmanız
                yeterlidir; yasal saklama yükümlülüğü olan kayıtlar dışındaki verileriniz silinir.
              </li>
            </ul>
          ),
        },
        {
          id: 'urun-fiyat',
          title: 'Ürünler, fiyatlar ve stok',
          body: (
            <ul>
              <li>
                Ürünler atölyemizde 3D baskıyla üretilir. Fotoğraflar ürünü olabildiğince doğru göstermeye çalışır; ekran
                ayarlarına bağlı küçük renk farkları ve katman dokusu üretim tekniğinin doğal sonucudur.
              </li>
              <li>Fiyatlar KDV dahildir ve önceden bildirimde bulunmadan değiştirilebilir; siparişinize sipariş anındaki fiyat uygulanır.</li>
              <li>
                Açıkça hatalı bir fiyat veya stok bilgisi gösterilmesi halinde siparişi onaylamadan önce sizi bilgilendiririz;
                dilerseniz sipariş iptal edilir ve ödemeniz eksiksiz iade edilir.
              </li>
              <li>Kampanya ve kupon koşulları ilgili kampanya sayfasında veya kupon açıklamasında belirtilir.</li>
            </ul>
          ),
        },
        {
          id: 'fikri-mulkiyet',
          title: 'Fikri mülkiyet',
          body: (
            <>
              <p>
                Sitedeki ürün tasarımları, fotoğraflar, metinler, logolar ve &quot;zuulab&quot;, &quot;zuukids&quot;,
                &quot;zuulife&quot;, &quot;zuulight&quot;, &quot;zuutoptan&quot; adları {COMPANY.owner}’ya aittir. Bunlar izin
                alınmadan kopyalanamaz, çoğaltılamaz veya ticari amaçla kullanılamaz.
              </p>
              <p>
                <strong>Özel üretim:</strong> Bize baskı için gönderdiğiniz model dosyalarının (STL, 3MF vb.) hakları size veya
                hak sahibine aittir. Dosyayı yalnızca siparişinizi üretmek için kullanırız. Dosyayı kullanma hakkına sahip
                olduğunuzu kabul edersiniz; üçüncü kişilerin haklarını ihlal ettiği açıkça anlaşılan veya yasa dışı ürünlerin
                üretimini reddedebiliriz.
              </p>
            </>
          ),
        },
        {
          id: 'kullanici-icerigi',
          title: 'Yorumlar ve kullanıcı içerikleri',
          body: (
            <p>
              Ürün yorumları yayınlanmadan önce incelenir. Hakaret, kişisel veri, reklam veya ürünle ilgisi olmayan içerik
              barındıran yorumlar yayınlanmaz. Yayınlanan yorumların sitede ve zuulab’ın tanıtımlarında gösterilmesine izin
              vermiş olursunuz.
            </p>
          ),
        },
        {
          id: 'yasaklar',
          title: 'Yasaklanan kullanım',
          body: (
            <ul>
              <li>Siteye, sunuculara veya diğer kullanıcıların hesaplarına yetkisiz erişim girişiminde bulunmak,</li>
              <li>Otomatik araçlarla siteyi aşırı yükleyecek şekilde veri toplamak,</li>
              <li>Başkası adına veya sahte bilgilerle sipariş vermek,</li>
              <li>Siteyi yasalara aykırı herhangi bir amaçla kullanmak yasaktır.</li>
            </ul>
          ),
        },
        {
          id: 'sorumluluk',
          title: 'Sorumluluk',
          body: (
            <p>
              Siteyi kesintisiz ve hatasız sunmak için özen gösteririz; bakım veya teknik arızalar nedeniyle yaşanabilecek
              kısa süreli kesintilerden dolayı sorumluluk kabul edilmez. Bu hüküm, tüketici mevzuatından doğan haklarınızı
              sınırlamaz.
            </p>
          ),
        },
        {
          id: 'hukuk',
          title: 'Değişiklikler ve uygulanacak hukuk',
          body: (
            <p>
              Bu koşulları güncelleyebiliriz; güncel metin bu sayfada yayınlandığı anda geçerlidir. Bu koşullar Türkiye
              Cumhuriyeti hukukuna tabidir; tüketici uyuşmazlıklarında tüketici hakem heyetleri ve tüketici mahkemeleri
              yetkilidir.
            </p>
          ),
        },
      ]}
    />
  )
}
