import type { Metadata } from 'next'
import Link from 'next/link'
import { pageMetadata } from '@/lib/seo/metadata'
import LegalDocument, { KeyValue } from '@/components/legal/LegalDocument'
import { legalDoc } from '@/lib/legal/documents'
import { COMPANY, DATA_PROCESSORS } from '@/config/company'
import { commercialEmailEnabled } from '@/lib/email/policy'

const doc = legalDoc('kvkk-aydinlatma-metni')

export const metadata: Metadata = pageMetadata({ title: doc.title, description: doc.summary, path: `/${doc.slug}` })

export default function KvkkNoticePage() {
  // The e-mail permission (member modal, payment-page box, reminders) is described only once commercial e-mail is switched on
  // (COMMERCIAL_EMAIL_ENABLED); the setting is read when the page is built, so turning it on means redeploying.
  const full = commercialEmailEnabled()
  const local = DATA_PROCESSORS.filter((p) => !p.abroad)
  const abroad = DATA_PROCESSORS.filter((p) => p.abroad)

  return (
    <LegalDocument
      doc={doc}
      intro={
        <p>
          6698 sayılı Kişisel Verilerin Korunması Kanunu (&quot;KVKK&quot;) uyarınca, veri sorumlusu sıfatıyla kişisel
          verilerinizi hangi amaçlarla ve nasıl işlediğimizi, kimlerle paylaştığımızı ve haklarınızı aşağıda açıklıyoruz.
        </p>
      }
      sections={[
        {
          id: 'veri-sorumlusu',
          title: 'Veri sorumlusu',
          body: (
            <KeyValue
              rows={[
                ['Veri sorumlusu', COMPANY.tradeName],
                ['Adres', COMPANY.address],
                ['E-posta', <a key="e" href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>],
                ['KEP adresi', COMPANY.kep],
              ]}
            />
          ),
        },
        {
          id: 'veriler',
          title: 'İşlenen kişisel veriler',
          body: (
            <table>
              <thead>
                <tr>
                  <th>Kategori</th>
                  <th>Veriler</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Kimlik</td>
                  <td>Ad, soyad; kurumsal faturada vergi numarası, şahıs faturasında T.C. kimlik numarası (girilirse)</td>
                </tr>
                <tr>
                  <td>İletişim</td>
                  <td>E-posta adresi, telefon numarası, teslimat ve fatura adresi</td>
                </tr>
                <tr>
                  <td>Müşteri işlem</td>
                  <td>Sipariş, sepet, favori, iade ve destek talebi bilgileri, ürün yorumları</td>
                </tr>
                <tr>
                  <td>Finans</td>
                  <td>Ödeme tutarı ve işlem sonucu (kart bilgileri bizde değil, ödeme kuruluşunda işlenir)</td>
                </tr>
                <tr>
                  <td>İşlem güvenliği</td>
                  <td>IP adresi, oturum ve giriş kayıtları, tarayıcı bilgisi</td>
                </tr>
                <tr>
                  <td>Pazarlama</td>
                  <td>
                    Bülten aboneliği ve onay kaydı{full ? '; e-posta izni (üyelikte giriş sonrası çıkan pencere ya da ödeme sayfasındaki kutu) ve onay kaydı' : ''}; e-postaların açılma ve tıklama bilgisi; izin verirseniz site kullanım ve reklam ölçüm verileri (ziyaret edilen sayfalar,
                    incelenen ve sepete eklenen ürünler, ödeme adımları, geldiğiniz reklam veya bağlantı, rastgele ziyaretçi numarası,
                    sipariş sırasında IP adresi ve tarayıcı bilgisi)
                  </td>
                </tr>
              </tbody>
            </table>
          ),
        },
        {
          id: 'amaclar',
          title: 'İşleme amaçları ve hukuki sebepler',
          body: (
            <table>
              <thead>
                <tr>
                  <th>Amaç</th>
                  <th>Hukuki sebep (KVKK m.5)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Siparişin alınması, ödemenin tahsili, ürünün üretimi ve teslimi, iade ve değişim</td>
                  <td>Sözleşmenin kurulması ve ifası (m.5/2-c)</td>
                </tr>
                <tr>
                  <td>Üyelik hesabının oluşturulması ve yönetimi</td>
                  <td>Sözleşmenin kurulması ve ifası (m.5/2-c)</td>
                </tr>
                <tr>
                  <td>Fatura düzenlenmesi, muhasebe ve vergi kayıtları, yasal saklama</td>
                  <td>Hukuki yükümlülüğün yerine getirilmesi (m.5/2-ç)</td>
                </tr>
                <tr>
                  <td>Şikâyet ve destek taleplerinin yanıtlanması</td>
                  <td>Sözleşmenin ifası (m.5/2-c), meşru menfaat (m.5/2-f)</td>
                </tr>
                <tr>
                  <td>Site ve hesap güvenliği, kötüye kullanımın önlenmesi</td>
                  <td>Meşru menfaat (m.5/2-f), hukuki yükümlülük (m.5/2-ç)</td>
                </tr>
                <tr>
                  <td>Bülten e-postaları (yalnızca bültene abone olanlara)</td>
                  <td>Açık rıza (m.5/1) ve 6563 sayılı Kanun kapsamında ticari ileti onayı</td>
                </tr>
                {full && (
                  <tr>
                    <td>
                      Kampanya ve indirim e-postaları, ödemesi tamamlanmayan sipariş için hatırlatma, teslim edilen siparişle ilgili ürün
                      değerlendirme isteği (yalnızca e-posta izni verenlere; bülten aboneliğinden bağımsız)
                    </td>
                    <td>Açık rıza (m.5/1) ve 6563 sayılı Kanun kapsamında ticari ileti onayı</td>
                  </tr>
                )}
                <tr>
                  <td>Site kullanım istatistikleri ve reklam ölçümü (analiz ve reklam çerezleri, Google Analytics, Meta Pixel ve Conversions API, kendi istatistik kaydımız)</td>
                  <td>Açık rıza (m.5/1)</td>
                </tr>
              </tbody>
            </table>
          ),
        },
        {
          id: 'toplama',
          title: 'Toplama yöntemi',
          body: (
            <p>
              Kişisel verileriniz; internet sitemizdeki üyelik, sipariş, iletişim ve bülten formları, e-posta ve telefon
              yazışmaları ile çerezler aracılığıyla, kısmen veya tamamen otomatik yollarla toplanır.
            </p>
          ),
        },
        {
          id: 'aktarim',
          title: 'Aktarım',
          body: (
            <>
              <h3>Yurt içi</h3>
              <ul>
                {local.map((p) => (
                  <li key={p.name}>
                    <strong>{p.name}</strong>: {p.purpose}
                  </li>
                ))}
                <li>
                  <strong>Yetkili kamu kurum ve kuruluşları</strong>: yasal zorunluluk halinde
                </li>
              </ul>
              <h3>Yurt dışı</h3>
              <p>
                Sitemizin çalışması için kullandığımız aşağıdaki hizmet sağlayıcıların sunucuları yurt dışındadır. Bu
                aktarımlar KVKK m.9 kapsamında uygun güvencelerle (standart sözleşmeler) ya da açık rızanıza dayanılarak
                yapılır:
              </p>
              <ul>
                {abroad.map((p) => (
                  <li key={p.name}>
                    <strong>{p.name}</strong>: {p.purpose}
                  </li>
                ))}
              </ul>
            </>
          ),
        },
        {
          id: 'saklama',
          title: 'Saklama süreleri',
          body: (
            <ul>
              <li>Fatura ve muhasebe kayıtları: Vergi Usul Kanunu gereği 5 yıl (takvim yılı sonundan itibaren)</li>
              <li>Mesafeli sözleşme ve sipariş kayıtları: 3 yıl</li>
              <li>Ticari elektronik ileti onay kayıtları: onayın geri alınmasından itibaren 3 yıl</li>
              <li>Üyelik bilgileri: üyelik süresince ve sona ermesinden sonra zamanaşımı süresince</li>
              <li>İşlem güvenliği kayıtları: 2 yıl</li>
              <li>Site kullanım kayıtları (kendi ziyaret istatistiğimiz): 14 ay</li>
              <li>Sipariş sırasında kaydedilen IP adresi, tarayıcı bilgisi ve reklam çerezi değerleri: 30 gün</li>
              <li>Kampanya e-postası gönderim ve etkileşim (açılma, tıklama) kayıtları: onayın geri alınmasından itibaren 3 yıl</li>
            </ul>
          ),
        },
        {
          id: 'haklar',
          title: 'Haklarınız',
          body: (
            <>
              <p>KVKK’nın 11. maddesi uyarınca;</p>
              <ul>
                <li>kişisel verilerinizin işlenip işlenmediğini öğrenme ve işlenmişse bilgi talep etme,</li>
                <li>işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme,</li>
                <li>yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme,</li>
                <li>eksik veya yanlış işlenmişse düzeltilmesini, şartları oluşmuşsa silinmesini veya yok edilmesini isteme,</li>
                <li>bu işlemlerin aktarıldığı üçüncü kişilere bildirilmesini isteme,</li>
                <li>münhasıran otomatik sistemlerle analiz edilmesi sonucu aleyhinize bir sonuç çıkmasına itiraz etme,</li>
                <li>kanuna aykırı işleme sebebiyle zarara uğramanız halinde zararın giderilmesini talep etme</li>
              </ul>
              <p>haklarına sahipsiniz.</p>
            </>
          ),
        },
        {
          id: 'basvuru',
          title: 'Başvuru',
          body: (
            <>
              <p>
                Taleplerinizi Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ’e uygun olarak aşağıdaki yollardan
                birine iletebilirsiniz:
              </p>
              <ul>
                <li>Yukarıdaki adrese ıslak imzalı dilekçe ile şahsen veya posta yoluyla,</li>
                <li>KEP adresimize ({COMPANY.kep}) güvenli elektronik imzalı olarak,</li>
                <li>
                  Sistemimizde kayıtlı e-posta adresinizden <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> adresine.
                </li>
              </ul>
              <p>
                Başvurunuz en geç 30 gün içinde ücretsiz olarak yanıtlanır. Kolaylık için{' '}
                <Link href="/kvkk-basvuru-formu">KVKK başvuru formunu</Link> kullanabilirsiniz.
              </p>
            </>
          ),
        },
      ]}
    />
  )
}
