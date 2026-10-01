import React from 'react'
import Link from 'next/link'
import styles from './HomeFinalDiscovery.module.css'

export default function HomeFinalDiscovery() {
  return (
    <section className={styles.section} aria-label="zuulab ürün kataloğunu keşfet">
      <div className={styles.container}>
        <span className={styles.eyebrow}>zuulab / tüm katalog</span>
        <h2 className={styles.title}>
          mekana karakter katan formları <span className={styles.titleAccent}>keşfedin.</span>
        </h2>
        <p className={styles.desc}>
          atölyemizde özenle dilimlenen ve 0.12mm fdm hassasiyetiyle üretilen tüm fonksiyonel masa aksesuarları, aydınlatmalar ve çocuk serisi.
        </p>

        <Link href="/urunler" className={styles.ctaBtn}>
          <span>tüm ürünleri incele</span>
          <span aria-hidden>→</span>
        </Link>

        <div className={styles.quickLinksRow}>
          <span className={styles.quickLabel}>koleksiyonlara hızlı geçiş:</span>
          <Link href="/koleksiyon/zuukids" className={styles.quickLink}>
            zuukids
          </Link>
          <Link href="/koleksiyon/zuulife" className={styles.quickLink}>
            zuulife
          </Link>
          <Link href="/koleksiyon/zuulight" className={styles.quickLink}>
            zuulight
          </Link>
          <Link href="/koleksiyon/zuutoptan" className={styles.quickLink}>
            zuutoptan
          </Link>
          <Link href="/koleksiyonlar" className={styles.quickLink}>
            tüm koleksiyonlar
          </Link>
        </div>
      </div>
    </section>
  )
}
