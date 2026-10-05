import type { Metadata } from 'next'
import Link from 'next/link'
import { pageMetadata } from '@/lib/seo/metadata'
import LegalDocument from '@/components/legal/LegalDocument'
import { legalDoc } from '@/lib/legal/documents'
import { COMPANY } from '@/config/company'
import { commercialEmailEnabled } from '@/lib/email/policy'
import {
  EMAIL_PERMISSION_TEXT,
  NEWSLETTER_CONSENT_TEXT,
  NEWSLETTER_CONSENT_TEXT_WITH_REMINDERS,
} from '@/lib/newsletter/consent'

const doc = legalDoc('ticari-elektronik-ileti-onayi')

export const metadata: Metadata = pageMetadata({ title: doc.title, description: doc.summary, path: `/${doc.slug}` })

/**
 * While commercial e-mail is switched off (COMMERCIAL_EMAIL_ENABLED) only the newsletter is offered, so only the
 * newsletter is described. Once it is switched on the page describes the single permission and its three ways in.
 * The setting is read when the page is built; turning it on means redeploying, which rebuilds the page.
 */
export default function CommercialMessageConsentPage() {
  const full = commercialEmailEnabled()

  const intro = (
    <p>
      6563 sayılı Elektronik Ticaretin Düzenlenmesi Hakkında Kanun ve Ticari İletişim ve Ticari Elektronik İletiler Hakkında
      Yönetmelik uyarınca, size kampanya ve tanıtım niteliğinde e-posta gönderebilmemiz için onayınız gerekir.
    </p>
  )

  const newsletterOnly = {
    id: 'onay',
    title: 'Onay metni',
    body: (
      <>
        <p>Bülten formundaki kutuyu işaretlediğinizde aşağıdaki metni onaylamış olursunuz:</p>
        <blockquote>
          <p>
            <strong>“{NEWSLETTER_CONSENT_TEXT}”</strong>
          </p>
        </blockquote>
        <p>
          Onay; {COMPANY.tradeName} ({COMPANY.email}) adına, belirttiğiniz e-posta adresine gönderilecek ticari elektronik iletileri
          kapsar. Kaydınızı tamamlamak için e-postanıza gönderilen doğrulama bağlantısına tıklamanız gerekir.
        </p>
      </>
    ),
  }

  const newsletterOnlyContent = {
    id: 'icerik',
    title: 'Ne göndereceğiz?',
    body: (
      <ul>
        <li>Yeni ürün ve koleksiyon duyuruları,</li>
        <li>Kampanya, indirim ve size özel kupon kodları,</li>
        <li>Atölyemizden haberler.</li>
      </ul>
    ),
  }

  const newsletterOnlyWithdraw = {
    id: 'red',
    title: 'Onayınızı geri alma',
    body: (
      <>
        <p>
          Onayınızı istediğiniz zaman, gerekçe göstermeden ve ücretsiz olarak geri alabilirsiniz. Her e-postanın altındaki &quot;abonelikten
          çık&quot; bağlantısına tıklamanız ya da {COMPANY.email} adresine yazmanız yeterlidir. Talebiniz en geç 3 iş günü içinde işleme
          alınır.
        </p>
        <p>
          Sipariş onayı, kargo bildirimi ve iade süreci gibi siparişinizle ilgili bilgilendirme e-postaları ticari ileti değildir ve
          onayınızdan bağımsız olarak gönderilir.
        </p>
      </>
    ),
  }

  const permissionSections = [
    {
      id: 'izin',
      title: 'Tek izin, istediğiniz kadar konu',
      body: (
        <>
          <p>
            zuulab&apos;dan e-posta ile kampanya, indirim, sepetinizle ya da siparişinizle ilgili hatırlatma ve bülten almak için tek bir
            ticari elektronik ileti izni vermeniz yeterlidir. İzni üç yerden verebilirsiniz; hepsinde kutu varsayılan olarak boştur ve
            sipariş vermek ya da üye olmak için işaretlemeniz gerekmez:
          </p>
          <ul>
            <li>
              <strong>Bülten formu (ana sayfa):</strong> hem bültene abone olmanızı hem bu izni vermenizi sağlar. Kaydınızı tamamlamak için
              e-postanıza gönderilen doğrulama bağlantısına tıklamanız gerekir.
            </li>
            <li>
              <strong>Üyelikte giriş sonrası çıkan pencere:</strong> yalnızca bu izni verir, bültene abone etmez. Pencereyi onaylamadan
              kapatırsanız izin vermemiş olursunuz. Pencere yalnızca e-posta adresi doğrulanmış hesaplara gösterilir.
            </li>
            <li>
              <strong>Ödeme sayfasındaki isteğe bağlı kutu:</strong> yalnızca bu izni verir, siparişte yazdığınız e-posta adresi için
              kaydedilir, bültene abone etmez.
            </li>
          </ul>
          <p>Bülten, bu iznin üzerine eklenen isteğe bağlı bir konudur: bültene özel içerikler yalnızca bültene abone olanlara gönderilir.</p>
        </>
      ),
    },
    {
      id: 'onay-metinleri',
      title: 'Onay metinleri',
      body: (
        <>
          <p>Ana sayfadaki bülten formundaki kutuyu işaretlediğinizde aşağıdaki metni onaylamış olursunuz:</p>
          <blockquote>
            <p>
              <strong>“{NEWSLETTER_CONSENT_TEXT_WITH_REMINDERS}”</strong>
            </p>
          </blockquote>
          <p>
            Üyelikteki pencerede &quot;evet, izin veriyorum&quot; dediğinizde, hesabınızdaki e-posta tercihlerinden izni açtığınızda ya da
            ödeme sayfasındaki kutuyu işaretlediğinizde aşağıdaki metni onaylamış olursunuz:
          </p>
          <blockquote>
            <p>
              <strong>“{EMAIL_PERMISSION_TEXT}”</strong>
            </p>
          </blockquote>
          <p>
            Onay; {COMPANY.tradeName} ({COMPANY.email}) adına, belirttiğiniz e-posta adresine gönderilecek ticari elektronik iletileri
            kapsar. Onayınızın metni, zamanı, IP adresiniz ve tarayıcı bilginiz kanıt olarak saklanır.
          </p>
        </>
      ),
    },
    {
      id: 'icerik',
      title: 'Ne göndereceğiz?',
      body: (
        <>
          <p>İzin verdiyseniz:</p>
          <ul>
            <li>Ödemesini tamamlamadığınız siparişiniz hakkında bir hatırlatma (en fazla haftada bir kez),</li>
            <li>Siparişinizin teslimatından bir hafta sonra ürünü değerlendirmenizi isteyen bir e-posta,</li>
            <li>Kampanya ve indirim bilgilendirmeleri.</li>
          </ul>
          <p>Ayrıca bültene abone olduysanız:</p>
          <ul>
            <li>Yeni ürün ve koleksiyon duyuruları,</li>
            <li>Bültene özel içerikler ve kupon kodları,</li>
            <li>Atölyemizden haberler.</li>
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
            İzninizi istediğiniz zaman, gerekçe göstermeden ve ücretsiz olarak geri alabilirsiniz. Herhangi bir ticari e-postanın altındaki
            çıkış bağlantısı (&quot;bültenden ve tüm kampanya e-postalarından ayrıl&quot; ya da &quot;iznimi geri alıyorum&quot;) tüm ticari
            e-postaları, bülten dahil, durdurur. Üyeyseniz Hesabım &gt; Profilim sayfasındaki e-posta tercihlerinden de kapatıp yeniden
            açabilirsiniz; {COMPANY.email} adresine yazarak da talepte bulunabilirsiniz. Talebiniz en geç 3 iş günü içinde işleme alınır.
          </p>
          <p>
            Sipariş onayı, kargo bildirimi ve iade süreci gibi siparişinizle ilgili bilgilendirme e-postaları ticari ileti değildir ve
            izinlerinizden bağımsız olarak gönderilir.
          </p>
        </>
      ),
    },
  ]

  const record = {
    id: 'kayit',
    title: 'Kayıtlar',
    body: (
      <p>
        Onayınızın tarihi, kaynağı ve onay metni kayıt altına alınır ve onayın geri alınmasından itibaren 3 yıl saklanır. Kişisel
        verilerinizin işlenmesi hakkında bilgi için <Link href="/kvkk-aydinlatma-metni">KVKK aydınlatma metnine</Link> bakabilirsiniz.
      </p>
    ),
  }

  return (
    <LegalDocument
      doc={doc}
      intro={intro}
      sections={full ? [...permissionSections, record] : [newsletterOnly, newsletterOnlyContent, newsletterOnlyWithdraw, record]}
    />
  )
}
