import type { Metadata } from 'next'
import Link from 'next/link'
import { pageMetadata } from '@/lib/seo/metadata'
import LegalDocument from '@/components/legal/LegalDocument'
import { legalDoc } from '@/lib/legal/documents'
import { COMPANY } from '@/config/company'
import { EMAIL_PERMISSION_TEXT, NEWSLETTER_CONSENT_TEXT } from '@/lib/newsletter/consent'

const doc = legalDoc('ticari-elektronik-ileti-onayi')

export const metadata: Metadata = pageMetadata({ title: doc.title, description: doc.summary, path: `/${doc.slug}` })

export default function CommercialMessageConsentPage() {
  return (
    <LegalDocument
      doc={doc}
      intro={
        <p>
          6563 sayılı Elektronik Ticaretin Düzenlenmesi Hakkında Kanun ve Ticari İletişim ve Ticari Elektronik İletiler
          Hakkında Yönetmelik uyarınca, size kampanya ve tanıtım niteliğinde e-posta gönderebilmemiz için onayınız gerekir.
        </p>
      }
      sections={[
        {
          id: 'iki-izin',
          title: 'İki ayrı izin',
          body: (
            <>
              <p>zuulab&apos;dan e-posta almak için birbirinden bağımsız iki ayrı izin vardır. Birini vermek diğerini vermiş olmanız anlamına gelmez:</p>
              <ul>
                <li>
                  <strong>Bülten aboneliği:</strong> bültene özel içerikleri (yeni ürün ve koleksiyon duyuruları, atölyeden haberler, bültene
                  özel kuponlar) almak içindir. Yalnızca bültene abone olanlara gönderilir.
                </li>
                <li>
                  <strong>E-posta izni:</strong> kampanya ve indirim bilgilendirmeleri ile sepetiniz ve siparişlerinizle ilgili hatırlatmaları
                  (ödemesini tamamlamadığınız sipariş için hatırlatma, ürün değerlendirme isteği gibi) almak içindir. Yalnızca bu izni verenlere
                  gönderilir.
                </li>
              </ul>
              <p>İsterseniz ikisini birden, isterseniz yalnızca birini verebilirsiniz.</p>
            </>
          ),
        },
        {
          id: 'bulten',
          title: 'Bülten aboneliği onay metni',
          body: (
            <>
              <p>Ana sayfadaki bülten formundaki kutuyu işaretlediğinizde aşağıdaki metni onaylamış olursunuz:</p>
              <blockquote>
                <p>
                  <strong>“{NEWSLETTER_CONSENT_TEXT}”</strong>
                </p>
              </blockquote>
              <p>
                Onay; {COMPANY.tradeName} ({COMPANY.email}) adına, belirttiğiniz e-posta adresine gönderilecek ticari elektronik
                iletileri kapsar. Kaydınızı tamamlamak için e-postanıza gönderilen doğrulama bağlantısına tıklamanız gerekir.
              </p>
            </>
          ),
        },
        {
          id: 'eposta-izni',
          title: 'E-posta izni onay metni',
          body: (
            <>
              <p>
                Üye olarak giriş yaptıktan sonra karşınıza çıkan pencerede &quot;evet, izin veriyorum&quot; dediğinizde ya da ödeme
                sayfasındaki isteğe bağlı kutuyu işaretlediğinizde aşağıdaki metni onaylamış olursunuz (kutu varsayılan olarak boştur ve
                sipariş vermek için işaretlemeniz gerekmez; pencereyi onaylamadan kapatırsanız izin vermemiş olursunuz):
              </p>
              <blockquote>
                <p>
                  <strong>“{EMAIL_PERMISSION_TEXT}”</strong>
                </p>
              </blockquote>
              <p>
                Üyelikte bu pencere yalnızca e-posta adresi doğrulanmış hesaplara gösterilir. Ödeme sayfasında verdiğiniz izin, siparişte
                yazdığınız e-posta adresi için kaydedilir. Bu izin bültene abone olmanız anlamına gelmez. Onayınızın metni, zamanı, IP
                adresiniz ve tarayıcı bilginiz kanıt olarak saklanır.
              </p>
            </>
          ),
        },
        {
          id: 'icerik',
          title: 'Ne göndereceğiz?',
          body: (
            <>
              <p>Bülten aboneliği ile:</p>
              <ul>
                <li>Yeni ürün ve koleksiyon duyuruları,</li>
                <li>Bültene özel içerikler ve kupon kodları,</li>
                <li>Atölyemizden haberler.</li>
              </ul>
              <p>E-posta izni ile:</p>
              <ul>
                <li>Ödemesini tamamlamadığınız siparişiniz hakkında bir hatırlatma (en fazla haftada bir kez),</li>
                <li>Siparişinizin teslimatından bir hafta sonra ürünü değerlendirmenizi isteyen bir e-posta,</li>
                <li>Kampanya ve indirim bilgilendirmeleri.</li>
              </ul>
              <p>Otomatik e-postalar bir adrese en fazla 3 günde bir gönderilir ve gece 21:00 ile 09:00 arasında gönderilmez.</p>
            </>
          ),
        },
        {
          id: 'red',
          title: 'İzninizi geri alma',
          body: (
            <>
              <p>
                İzinlerinizi istediğiniz zaman, gerekçe göstermeden ve ücretsiz olarak geri alabilirsiniz. Bülten e-postalarının altındaki
                &quot;bültenden ayrıl&quot; bağlantısı yalnızca bülten aboneliğinizi, otomatik e-postaların altındaki &quot;iznimi geri
                alıyorum&quot; bağlantısı yalnızca e-posta izninizi sonlandırır. {COMPANY.email} adresine yazarak da ikisini ya da birini
                geri alabilirsiniz. Talebiniz en geç 3 iş günü içinde işleme alınır.
              </p>
              <p>
                Sipariş onayı, kargo bildirimi ve iade süreci gibi siparişinizle ilgili bilgilendirme e-postaları ticari ileti
                değildir ve izinlerinizden bağımsız olarak gönderilir.
              </p>
            </>
          ),
        },
        {
          id: 'kayit',
          title: 'Kayıtlar',
          body: (
            <p>
              Onayınızın tarihi, kaynağı ve onay metni kayıt altına alınır ve onayın geri alınmasından itibaren 3 yıl saklanır.
              Kişisel verilerinizin işlenmesi hakkında bilgi için <Link href="/kvkk-aydinlatma-metni">KVKK aydınlatma metnine</Link>{' '}
              bakabilirsiniz.
            </p>
          ),
        },
      ]}
    />
  )
}
