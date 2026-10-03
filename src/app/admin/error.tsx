'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import styles from '@/components/common/StatusPage.module.css'

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className={`${styles.body} ${styles.inline}`}>
      <div className={styles.content}>
        <h1 className={styles.title}>Bu ekran açılamadı</h1>
        <p className={styles.text}>
          Beklenmeyen bir hata oluştu; kayıtlı veriler değişmedi. Tekrar deneyin, sürerse hata kodunu destek kaydına ekleyin.
        </p>
        <div className={styles.actions}>
          <button type="button" className="btn btn-primary" onClick={reset}>
            Tekrar dene
          </button>
          <Link href="/" className="btn btn-secondary">
            Kontrol paneli
          </Link>
        </div>
        {error.digest && <p className={styles.reference}>Hata kodu: {error.digest}</p>}
      </div>
    </div>
  )
}
