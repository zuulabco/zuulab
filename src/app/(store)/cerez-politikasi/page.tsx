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

/** Kept in the browser's own storage (not cookies), only after "tümünü kabul et" */
const OWN_STATS_STORAGE: Array<[string, string, string]> = [
  ['zuulab_aid', 'Rastgele üretilen ziyaretçi numarası: aynı ziyaretçinin sayfa ve alışveriş adımlarını bir araya getirir', 'siz silene kadar'],
  ['zuulab_sid', 'Aynı ziyaretteki adımları birleştiren oturum numarası', 'sekmeyi kapatana kadar'],
  ['zuulab_attr_first, zuulab_attr_last', 'Siteye hangi reklam veya bağlantıdan geldiğiniz (kampanya bilgisi ve reklam tıklama kimliği)', 'siz silene kadar'],
  ['zuulab_purchase_sent', 'Aynı siparişin iki kez sayılmaması için tutulan kayıt', 'siz silene kadar'],
]

const MARKETING: Array<[string, string, string]> = [
  ['_fbp', 'Meta Pixel: tarayıcınızı tanır, reklam ölçümünü mümkün kılar', '3 ay'],
  ['_fbc', 'Meta Pixel: bir Meta reklamından geldiğinizde, tıklanan reklamı hatırlar', '3 ay'],
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
              <p>
                Aynı izinle, kendi sunucularımızda da bir istatistik kaydı tutarız: hangi sayfaların açıldığı, hangi ürünlerin
                incelendiği ve sepete eklendiği, ödeme adımlarına gelinip gelinmediği ve siteye hangi reklam veya bağlantıdan
                gelindiği, aşağıdaki rastgele ziyaretçi numarasıyla birlikte veritabanımıza yazılır. Bu kayıt ad, e-posta, adres
                veya ödeme bilgisi içermez, sayfa adresinin soru işaretinden sonraki kısmı saklanmaz ve 14 ay sonra silinir.
              </p>
              <CookieTable rows={OWN_STATS_STORAGE} />
            </>
          ),
        },
        {
          id: 'reklam',
          title: 'Reklam ölçüm çerezleri (yalnızca izninizle)',
          body: (
            <>
              <p>
                Çerez bandında &quot;tümünü kabul et&quot; seçeneğini işaretlerseniz Meta (Facebook ve Instagram) Pixel
                çerezlerini kullanırız. Bunlar, Meta reklamlarımızın siteye ne kadar ziyaret ve sipariş getirdiğini ölçmemizi
                sağlar. Görüntülediğiniz ve sepete eklediğiniz ürünler, ödeme adımları ve verdiğiniz siparişin tutarı
                Meta’ya bildirilir.
              </p>
              <CookieTable rows={MARKETING} />
              <p>
                Bir sipariş verdiğinizde, siparişin reklamdan geldiğini doğrulamak için sipariş bilgisi sunucumuzdan da Meta’ya
                gönderilir (Meta Conversions API). Bu aktarımda e-posta, telefon, ad ve şehir bilgisi geri çevrilemeyen bir
                şifreleme (hash) ile, IP adresi ve tarayıcı bilgisi ise olduğu gibi iletilir. Kart bilgisi hiçbir zaman
                gönderilmez. Siparişin reklamdan geldiğini doğrulamak için sipariş sırasında tarayıcı bilginiz, IP adresiniz ve
                yukarıdaki reklam çerezlerinin değerleri siparişle birlikte geçici olarak saklanır ve 30 gün sonra silinir. Bu aktarım
                yurt dışına yapıldığından <Link href="/acik-riza-metni">açık rıza metni</Link> kapsamındadır.
              </p>
              <p>
                &quot;Yalnızca gerekli&quot; seçeneğini işaretlerseniz Meta Pixel yüklenmez ve Meta’ya hiçbir bilgi gönderilmez.
              </p>
            </>
          ),
        },
        {
          id: 'tercih',
          title: 'Tercihinizi değiştirme',
          body: (
            <>
              <p>
                &quot;Yalnızca gerekli&quot; seçeneğini işaretlerseniz analiz ve reklam ölçüm çerezleri hiç yüklenmez. Kararınızı değiştirmek
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
