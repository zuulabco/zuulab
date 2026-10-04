import type { Metadata } from 'next'
import Link from 'next/link'
import { pageMetadata } from '@/lib/seo/metadata'
import LegalDocument from '@/components/legal/LegalDocument'
import { legalDoc } from '@/lib/legal/documents'
import { COMPANY } from '@/config/company'

const doc = legalDoc('gizlilik-politikasi')

export const metadata: Metadata = pageMetadata({ title: doc.title, description: doc.summary, path: `/${doc.slug}` })

export default function PrivacyPolicyPage() {
  return (
    <LegalDocument
      doc={doc}
      intro={
        <p>
          zuulab olarak yalnızca siparişinizi ulaştırmak ve size hizmet vermek için gereken bilgileri topluyor, bunları
          korumak için aşağıdaki önlemleri alıyoruz. Kişisel verilerinizin işlenmesine ilişkin yasal bilgilendirme{' '}
          <Link href="/kvkk-aydinlatma-metni">KVKK aydınlatma metninde</Link>, çerezler{' '}
          <Link href="/cerez-politikasi">çerez politikasında</Link> yer alır.
        </p>
      }
      sections={[
        {
          id: 'ilke',
          title: 'Temel ilkemiz',
          body: (
            <ul>
              <li>Kişisel verilerinizi satmayız, kiralamayız ve reklam amacıyla üçüncü kişilerle paylaşmayız.</li>
              <li>Yalnızca hizmet için gerekli olan veriyi, gerekli olduğu süre kadar saklarız.</li>
              <li>Verilerinize yalnızca işi gereği erişmesi gereken kişiler erişebilir.</li>
            </ul>
          ),
        },
        {
          id: 'odeme',
          title: 'Ödeme güvenliği',
          body: (
            <p>
              Kart bilgileriniz sitemizde girilmez ve saklanmaz. Ödemeler, Türkiye Cumhuriyet Merkez Bankası lisanslı ödeme
              kuruluşu PayTR’nin güvenli ödeme sayfasında, 3D Secure doğrulamasıyla alınır. Bize yalnızca ödemenin sonucu ve
              tutarı iletilir.
            </p>
          ),
        },
        {
          id: 'teknik',
          title: 'Teknik önlemler',
          body: (
            <ul>
              <li>Sitemizle aranızdaki tüm iletişim HTTPS (TLS) ile şifrelenir.</li>
              <li>Şifreleriniz bizde tutulmaz; üyelik girişi Google’ın Firebase kimlik doğrulama altyapısıyla yapılır.</li>
              <li>Hassas bilgiler (ör. pazaryeri API anahtarları) veritabanında şifrelenmiş olarak saklanır.</li>
              <li>Yönetim paneline erişim yetki ve rol bazlı sınırlandırılmıştır; yapılan işlemler kayıt altına alınır.</li>
              <li>Form ve giriş işlemlerinde kötüye kullanıma karşı istek sınırlaması uygulanır.</li>
            </ul>
          ),
        },
        {
          id: 'hesap',
          title: 'Hesabınızın güvenliği',
          body: (
            <ul>
              <li>Başka sitelerde kullanmadığınız, güçlü bir şifre seçin ya da Google hesabınızla giriş yapın.</li>
              <li>Ortak kullanılan cihazlarda işiniz bittiğinde çıkış yapın.</li>
              <li>
                zuulab sizden e-posta, SMS veya telefonla asla şifrenizi ya da kart bilgilerinizi istemez. Böyle bir talep
                alırsanız lütfen bize bildirin.
              </li>
            </ul>
          ),
        },
        {
          id: 'cocuklar',
          title: 'Çocuklar',
          body: (
            <p>
              Sitemizden alışveriş yapmak için 18 yaşını doldurmuş olmak gerekir. zuukids koleksiyonundaki ürünler çocuklar
              için tasarlanmış olsa da siparişler ebeveynler tarafından verilmelidir.
            </p>
          ),
        },
        {
          id: 'baglantilar',
          title: 'Diğer sitelere bağlantılar',
          body: (
            <p>
              Sitemizde sosyal medya hesaplarımıza ve WhatsApp’a bağlantılar bulunur. Bu sitelerin gizlilik uygulamaları
              kendi politikalarına tabidir.
            </p>
          ),
        },
        {
          id: 'ihlal',
          title: 'Veri güvenliği ihlali',
          body: (
            <p>
              Kişisel verilerinizi etkileyen bir güvenlik ihlali olması halinde, KVKK’ya uygun olarak Kişisel Verileri Koruma
              Kurulu’na ve etkilenen kişilere en kısa sürede bildirimde bulunuruz. Güvenlik açığı bildirimlerinizi{' '}
              <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> adresine iletebilirsiniz.
            </p>
          ),
        },
        {
          id: 'degisiklikler',
          title: 'Değişiklikler',
          body: <p>Bu politikayı güncellediğimizde sayfanın başındaki tarih ve sürüm numarası değişir.</p>,
        },
      ]}
    />
  )
}
