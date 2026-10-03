import type { Metadata } from 'next'
import Breadcrumbs from '@/components/common/Breadcrumbs'
import styles from '../ContentPage.module.css'

export const metadata: Metadata = {
  title: 'Kullanım Koşulları',
  description: 'Zuulab web sitesi kullanım şartları, fikri mülkiyet ve sipariş koşulları.',
}

export default function KullanimKosullariPage() {
  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.breadcrumbRow}>
        <Breadcrumbs items={[{ label: 'Kullanım Koşulları' }]} />
      </div>

      <header className={styles.pageHero}>
        <span className={styles.heroEyebrow}>zuulab / yasal</span>
        <h1 className={styles.heroTitle}>kullanım koşulları</h1>
      </header>

      <article className={`${styles.legalPage} ${styles.prose}`}>
        <div className={styles.legalDisclaimer}>
          hukuki bilgilendirme notu — Bu sözleşme taslak niteliğinde olup, platformumuzun
          genel kurallarını ve kullanım prensiplerini açıklamaktadır. Nihai hukuki
          değerlendirmeye tabidir.
        </div>

        <section className={styles.sectionFirst}>
          <h2>1. genel hükümler</h2>
          <p>
            Bu web sitesini (zuulab.com) ziyaret eden ve alışveriş yapan tüm kullanıcılar,
            işbu Kullanım Koşulları&apos;nı okumuş, anlamış ve kabul etmiş sayılır. Zuulab,
            sitede sunulan ürün, fiyat ve kampanya şartlarını önceden haber vermeksizin
            güncelleme hakkını saklı tutar.
          </p>
        </section>

        <section className={styles.section}>
          <h2>2. fikri ve sınai mülkiyet hakları</h2>
          <p>
            Zuulab üzerinde sergilenen tüm 3D tasarımlar, modellemeler, fotoğraflar,
            grafikler, marka logoları ve metin içerikleri Zuulab&apos;a aittir. İzinsiz olarak
            kopyalanamaz, çoğaltılamaz, tersine mühendislikle yeniden üretilemez veya
            ticari amaçla dağıtılamaz.
          </p>
        </section>

        <section className={styles.section}>
          <h2>3. sipariş ve üretim doğası</h2>
          <p>
            Ürünlerimiz katmanlı üretim teknolojisi (3D printing) ile üretildiğinden,
            yüzeylerde katman çizgileri (layer lines) ve mikro doku farklılıkları bulunması
            teknolojinin doğal bir parçasıdır. Bu durum bir üretim hatası değil, ürünün
            özgün üretim kimliğidir.
          </p>
        </section>
      </article>
    </div>
  )
}
