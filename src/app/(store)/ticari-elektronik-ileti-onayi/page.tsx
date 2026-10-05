import type { Metadata } from 'next'
import Link from 'next/link'
import { pageMetadata } from '@/lib/seo/metadata'
import LegalDocument from '@/components/legal/LegalDocument'
import { legalDoc } from '@/lib/legal/documents'
import { COMPANY } from '@/config/company'
import { CHECKOUT_MARKETING_CONSENT_TEXT, NEWSLETTER_CONSENT_TEXT } from '@/lib/newsletter/consent'

const doc = legalDoc('ticari-elektronik-ileti-onayi')

export const metadata: Metadata = pageMetadata({ title: doc.title, description: doc.summary, path: `/${doc.slug}` })

export default function CommercialMessageConsentPage() {
  return (
    <LegalDocument
      doc={doc}
      intro={
        <p>
          6563 sayılı Elektronik Ticaretin Düzenlenmesi Hakkında Kanun ve Ticari İletişim ve Ticari Elektronik İletiler
          Hakkında Yönetmelik uyarınca, size kampanya ve tanıtım e-postası gönderebilmemiz için onayınız gerekir.
        </p>
      }
      sections={[
        {
          id: 'onay',
          title: 'Onay metni',
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
                iletileri kapsar. Bülten formundan kaydolurken kaydınızı tamamlamak için e-postanıza gönderilen doğrulama
                bağlantısına tıklamanız gerekir.
              </p>
              <p>Ödeme sayfasındaki isteğe bağlı kutuyu işaretlediğinizde ise aşağıdaki metni onaylamış olursunuz (kutu varsayılan olarak boştur ve sipariş vermek için işaretlemeniz gerekmez):</p>
              <blockquote>
                <p>
                  <strong>“{CHECKOUT_MARKETING_CONSENT_TEXT}”</strong>
                </p>
              </blockquote>
              <p>
                Bu durumda onayınız, siparişte yazdığınız e-posta adresi için ayrıca doğrulama beklenmeden kaydedilir; onay metni,
                zamanı, IP adresiniz ve tarayıcı bilginiz onayın kanıtı olarak saklanır.
              </p>
            </>
          ),
        },
        {
          id: 'icerik',
          title: 'Ne göndereceğiz?',
          body: (
            <ul>
              <li>Yeni ürün ve koleksiyon duyuruları,</li>
              <li>Kampanya, indirim ve size özel kupon kodları,</li>
              <li>Ödemesini tamamlamadığınız sepetiniz hakkında hatırlatma (yalnızca onay verenlere, en fazla haftada bir kez),</li>
              <li>Atölyemizden haberler.</li>
            </ul>
          ),
        },
        {
          id: 'red',
          title: 'Onayınızı geri alma',
          body: (
            <>
              <p>
                Onayınızı istediğiniz zaman, gerekçe göstermeden ve ücretsiz olarak geri alabilirsiniz. Her e-postanın altındaki
                &quot;abonelikten çık&quot; bağlantısına tıklamanız ya da {COMPANY.email} adresine yazmanız yeterlidir. Talebiniz
                en geç 3 iş günü içinde işleme alınır.
              </p>
              <p>
                Sipariş onayı, kargo bildirimi ve iade süreci gibi siparişinizle ilgili bilgilendirme e-postaları ticari ileti
                değildir ve onayınızdan bağımsız olarak gönderilir.
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
