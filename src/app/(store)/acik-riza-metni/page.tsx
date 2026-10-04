import type { Metadata } from 'next'
import Link from 'next/link'
import { pageMetadata } from '@/lib/seo/metadata'
import LegalDocument from '@/components/legal/LegalDocument'
import { legalDoc } from '@/lib/legal/documents'
import { COMPANY } from '@/config/company'

const doc = legalDoc('acik-riza-metni')

export const metadata: Metadata = pageMetadata({ title: doc.title, description: doc.summary, path: `/${doc.slug}` })

export default function ExplicitConsentPage() {
  return (
    <LegalDocument
      doc={doc}
      intro={
        <p>
          Bu metin, KVKK’nın 5. ve 9. maddeleri kapsamında yalnızca açık rızanıza dayanan işlemleri açıklar. Rıza vermek
          zorunlu değildir; vermemeniz alışveriş yapmanıza engel olmaz.
        </p>
      }
      sections={[
        {
          id: 'analiz',
          title: 'Analiz çerezleri ve yurt dışına aktarım',
          body: (
            <>
              <p>
                Çerez bandında <strong>&quot;tümünü kabul et&quot;</strong> seçeneğini işaretleyerek;{' '}
                {COMPANY.tradeName} tarafından, sitemizi nasıl kullandığınıza ilişkin verilerin (ziyaret edilen sayfalar,
                tıklamalar, incelenen ürünler, cihaz ve yaklaşık konum bilgisi) site kullanım istatistiklerinin oluşturulması
                amacıyla Google Analytics aracılığıyla işlenmesine ve bu amaçla sunucuları yurt dışında bulunan Google’a
                aktarılmasına açık rıza vermiş olursunuz.
              </p>
              <p>
                Ayrıntılar <Link href="/cerez-politikasi">çerez politikasında</Link> yer alır.
              </p>
            </>
          ),
        },
        {
          id: 'pazarlama',
          title: 'Bülten ve kampanya e-postaları',
          body: (
            <p>
              Bülten formundaki onay kutusunu işaretleyerek e-posta adresinizin kampanya ve yenilik duyuruları gönderilmesi
              amacıyla işlenmesine ve e-postaların gönderimi için yurt dışındaki e-posta hizmet sağlayıcımıza (Resend)
              aktarılmasına açık rıza verirsiniz. Ayrıntılar{' '}
              <Link href="/ticari-elektronik-ileti-onayi">ticari elektronik ileti onay metninde</Link> yer alır.
            </p>
          ),
        },
        {
          id: 'geri-alma',
          title: 'Rızanızı geri alma',
          body: (
            <ul>
              <li>
                Analiz çerezleri için: tarayıcınızdan bu sitenin çerezlerini ve site verilerini silin, bir sonraki ziyaretinizde
                &quot;yalnızca gerekli&quot; seçeneğini işaretleyin.
              </li>
              <li>Bülten için: her e-postanın altındaki &quot;abonelikten çık&quot; bağlantısını kullanın.</li>
              <li>
                Her iki konuda da <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> adresine yazabilirsiniz.
              </li>
            </ul>
          ),
        },
        {
          id: 'kapsam-disi',
          title: 'Rızaya dayanmayan işlemler',
          body: (
            <p>
              Siparişinizin teslimi, faturalandırma ve hesabınızın yönetimi gibi işlemler açık rızaya değil, sözleşme ve yasal
              yükümlülük hukuki sebeplerine dayanır; bunlar <Link href="/kvkk-aydinlatma-metni">KVKK aydınlatma metninde</Link>{' '}
              açıklanmıştır.
            </p>
          ),
        },
      ]}
    />
  )
}
