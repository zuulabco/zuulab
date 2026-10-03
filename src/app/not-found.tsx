import Link from 'next/link'
import styles from '@/components/common/StatusPage.module.css'

export const metadata = { title: 'Sayfa bulunamadı' }

export default function NotFound() {
  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <Link href="/" className={styles.logo} aria-label="zuulab ana sayfa">
          zuulab<span className={styles.logoDot} />
        </Link>
      </header>
      <main className={styles.body}>
        <div className={styles.content}>
          <div className={styles.code} aria-hidden="true">
            404
          </div>
          <span className={styles.layer} aria-hidden="true" />
          <h1 className={styles.title}>Bu sayfa bulunamadı</h1>
          <p className={styles.text}>
            Adres değişmiş ya da ürün artık satışta olmayabilir. Ana sayfadan ya da ürünler arasından devam edebilirsiniz.
          </p>
          <div className={styles.actions}>
            <Link href="/urunler" className="btn btn-primary btn-lg">
              Ürünlere göz at
            </Link>
            <Link href="/" className="btn btn-secondary btn-lg">
              Ana sayfa
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
