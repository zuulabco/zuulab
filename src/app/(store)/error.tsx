'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import styles from '@/components/common/StatusPage.module.css'

export default function StoreError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className={`${styles.body} ${styles.inline}`}>
      <div className={styles.content}>
        <span className={styles.layer} aria-hidden="true" />
        <h1 className={styles.title}>Sayfa yüklenemedi</h1>
        <p className={styles.text}>
          Beklenmeyen bir hata oluştu. Sepetiniz ve siparişleriniz etkilenmedi. Tekrar deneyebilir ya da ana sayfaya
          dönebilirsiniz.
        </p>
        <div className={styles.actions}>
          <button type="button" className="btn btn-primary btn-lg" onClick={reset}>
            Tekrar dene
          </button>
          <Link href="/" className="btn btn-secondary btn-lg">
            Ana sayfa
          </Link>
        </div>
        {error.digest && <p className={styles.reference}>Hata kodu: {error.digest}</p>}
      </div>
    </div>
  )
}
