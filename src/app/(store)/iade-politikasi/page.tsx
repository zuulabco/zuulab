import type { Metadata } from 'next'
import { pageMetadata } from '@/lib/seo/metadata'
import Link from 'next/link'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import styles from '../ContentPage.module.css'

export const metadata: Metadata = pageMetadata({
  title: 'İade ve değişim politikası',
  description:
    'zuulab iade politikası: 14 gün cayma hakkı, ücretsiz iade kargo kodu, online iade (RMA) adımları ve ücret iadesinin kartınıza yansıma süresi.',
  path: '/iade-politikasi',
})

export default function IadePolitikasiPage() {
  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.breadcrumbRow}>
        <Breadcrumbs items={[{ label: 'İade ve Değişim Politikası' }]} />
      </div>

      <header className={styles.pageHero}>
        <span className={styles.heroEyebrow}>zuulab / yasal</span>
        <h1 className={styles.heroTitle}>iade ve değişim politikası</h1>
      </header>

      <article className={`${styles.legalPage} ${styles.prose}`}>
        <div className={styles.legalDisclaimer}>
          hukuki bilgilendirme notu — 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve
          Mesafeli Sözleşmeler Yönetmeliği hükümleri çerçevesinde hazırlanmış operasyonel
          taslak metindir.
        </div>

        <section className={styles.sectionFirst}>
          <h2>1. cayma hakkı (14 gün)</h2>
          <p>
            Tüketici, standart katalog ürünlerinde herhangi bir gerekçe göstermeksizin ve
            cezai şart ödemeksizin, ürünün kendisine veya gösterdiği adresteki kişiye
            tesliminden itibaren <strong>14 (on dört) gün</strong> içinde cayma hakkına sahiptir.
          </p>
        </section>

        <section className={styles.section}>
          <h2>2. online iade süreci (rma)</h2>
          <p>
            Zuulab, hızlı ve şeffaf bir iade süreci için dijital İade Yönetim Sistemi (RMA)
            kullanır:
          </p>
          <ol>
            <li>
              <Link href="/hesap/siparisler">Hesabım &gt; Siparişlerim</Link> ekranından
              teslim edilen siparişinizi seçin.
            </li>
            <li>
              &quot;İade / Değişim Talebi Oluştur&quot; butonuna tıklayarak iade nedeninizi belirtin.
            </li>
            <li>
              Talebiniz incelenip onaylandığında sistemimiz otomatik olarak{' '}
              <strong>ücretsiz iade kargo kodu</strong> üretir.
            </li>
            <li>Anlaşmalı kargo şubesine bu kodla paketi teslim edin.</li>
          </ol>
        </section>

        <section className={styles.section}>
          <h2>3. iade kabul koşulları</h2>
          <ul>
            <li>
              İade edilecek ürünün orijinal ambalajında, hasarsız ve eksiksiz olması
              gerekmektedir.
            </li>
            <li>
              Müşterinin özel isteği doğrultusunda kişiselleştirilmiş (özel isim, logo
              veya özel renk üretimi yapılan) ürünlerde yasal olarak cayma hakkı
              bulunmamaktadır.
            </li>
            <li>
              Kargo teslimi sırasında tespit edilen kırık veya hasarlı ürünlerde kargo
              görevlisine <em>Hasar Tespit Tutanağı</em> tutturulmalıdır.
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>4. ücret iadesi</h2>
          <p>
            Atölyemize ulaşan ürünün teknik muayenesi tamamlandıktan sonra, ödeme yapılan
            kredi kartınıza azami 3–7 iş günü içinde iade tutarı yansıtılır.
          </p>
        </section>
      </article>
    </div>
  )
}
