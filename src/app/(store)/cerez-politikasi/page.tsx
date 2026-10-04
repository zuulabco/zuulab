import type { Metadata } from 'next'
import Link from 'next/link'
import { pageMetadata } from '@/lib/seo/metadata'
import LegalDocument from '@/components/legal/LegalDocument'
import { legalDoc } from '@/lib/legal/documents'

const doc = legalDoc('cerez-politikasi')

export const metadata: Metadata = pageMetadata({ title: doc.title, description: doc.summary, path: `/${doc.slug}` })

const ESSENTIAL: Array<[string, string, string]> = [
  ['zuulab_session', 'Hesabınıza giriş yaptığınızda oturumunuzu güvenle açık tutar', '7 gün'],
  ['zuulab_order_access', 'Üye olmadan verdiğiniz siparişin durumunu görüntülemenizi sağlar', '1 gün'],
  ['zuulab_cookie_consent', 'Çerez tercihinizi hatırlar', '1 yıl'],
]

const STORAGE: Array<[string, string]> = [
  ['zuulab-cart', 'Sepetinizdeki ürünler'],
  ['zuulab_local_favorites', 'Üye girişi yapmadan eklediğiniz favoriler'],
  ['zuulab_recent_searches', 'Son aramalarınız'],
  ['zuu-catalog-columns', 'Ürün listesinde seçtiğiniz görünüm (sütun sayısı)'],
]

const ANALYTICS: Array<[string, string, string]> = [
  ['_ga', 'Google Analytics: ziyaretçileri birbirinden ayırt eder', '2 yıl'],
  ['_ga_4D608HQZZ1', 'Google Analytics: oturum bilgisini tutar', '2 yıl'],
]

export default function CookiePolicyPage() {
  return (
    <LegalDocument
      doc={doc}
      intro={
        <p>
          Çerezler, bir siteyi ziyaret ettiğinizde tarayıcınıza kaydedilen küçük metin dosyalarıdır. Aşağıda sitemizde
          hangi çerezleri ve tarayıcı depolamasını kullandığımızı, neden kullandığımızı ve tercihinizi nasıl
          değiştirebileceğinizi açıklıyoruz.
        </p>
      }
      sections={[
        {
          id: 'zorunlu',
          title: 'Zorunlu çerezler',
          body: (
            <>
              <p>
                Sitenin çalışması için gereklidir ve her zaman kullanılır. Bu çerezler için onay istenmez; reklam veya takip
                amacı taşımazlar.
              </p>
              <CookieTable rows={ESSENTIAL} />
            </>
          ),
        },
        {
          id: 'depolama',
          title: 'Tarayıcı depolaması',
          body: (
            <>
              <p>
                Aşağıdaki bilgiler sunucumuza gönderilmeden yalnızca tarayıcınızda (localStorage) tutulur ve siz silene kadar
                kalır:
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Ad</th>
                    <th>Amaç</th>
                  </tr>
                </thead>
                <tbody>
                  {STORAGE.map(([name, purpose]) => (
                    <tr key={name}>
                      <td>
                        <code>{name}</code>
                      </td>
                      <td>{purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ),
        },
        {
          id: 'analiz',
          title: 'Analiz çerezleri (yalnızca izninizle)',
          body: (
            <>
              <p>
                Çerez bandında &quot;tümünü kabul et&quot; seçeneğini işaretlerseniz Google Analytics çerezlerini kullanırız.
                Bu çerezler hangi sayfaların görüntülendiğini, ziyaret süresini, siteye nereden gelindiğini, cihaz türünü,
                yaklaşık konumu (şehir düzeyinde), incelenen veya sepete eklenen ürünleri ve sayfadaki tıklamaları ölçer.
              </p>
              <CookieTable rows={ANALYTICS} />
              <p>
                Ad, e-posta, adres veya ödeme bilgisi Google’a gönderilmez; IP adresleri Google tarafından saklanmaz. Veriler
                yalnızca sitemizi ve ürünlerimizi geliştirmek için toplu istatistik olarak kullanılır. Bu aktarım yurt dışına
                yapıldığından <Link href="/acik-riza-metni">açık rıza metni</Link> kapsamındadır.
              </p>
              <p>Reklam, yeniden pazarlama veya kişiselleştirilmiş reklam çerezi kullanmıyoruz.</p>
            </>
          ),
        },
        {
          id: 'tercih',
          title: 'Tercihinizi değiştirme',
          body: (
            <>
              <p>
                &quot;Yalnızca gerekli&quot; seçeneğini işaretlerseniz analiz çerezleri hiç yüklenmez. Kararınızı değiştirmek
                için tarayıcınızın ayarlarından bu sitenin çerezlerini ve site verilerini silmeniz yeterlidir; bir sonraki
                ziyaretinizde size yeniden sorulur.
              </p>
              <p>
                Tarayıcınızın ayarlarından tüm çerezleri engelleyebilirsiniz; ancak bu durumda giriş yapma ve sepet gibi bazı
                özellikler çalışmayabilir.
              </p>
            </>
          ),
        },
      ]}
    />
  )
}

function CookieTable({ rows }: { rows: Array<[string, string, string]> }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Çerez</th>
          <th>Amaç</th>
          <th>Süre</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([name, purpose, duration]) => (
          <tr key={name}>
            <td>
              <code>{name}</code>
            </td>
            <td>{purpose}</td>
            <td>{duration}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
