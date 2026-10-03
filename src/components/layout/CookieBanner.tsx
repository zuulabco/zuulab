'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getConsent, setConsent, type ConsentLevel } from '@/lib/consent'
import styles from './CookieBanner.module.css'

/**
 * Cookie notice along the bottom of the storefront until the visitor chooses.
 * Rendered only after mount (the choice lives in the browser), so it never flashes
 * for someone who already answered.
 */
export default function CookieBanner() {
  const [visible, setVisible] = useState(false)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    // Read after mount; a short delay lets the page settle before the bar slides in
    const t = setTimeout(() => setVisible(getConsent() === null), 600)
    return () => clearTimeout(t)
  }, [])

  const choose = (level: ConsentLevel) => {
    setConsent(level)
    setLeaving(true)
    setTimeout(() => setVisible(false), 260)
  }

  if (!visible) return null

  return (
    <section
      className={`${styles.banner} ${leaving ? styles.leaving : ''}`}
      role="region"
      aria-label="Çerez tercihleri"
    >
      <div className={styles.inner}>
        <p className={styles.text}>
          Sitemizin çalışması için gerekli çerezleri (oturum, sepet ve favoriler) kullanıyoruz. İzin verirsen deneyimini
          iyileştirmek için analiz çerezlerini de kullanabiliriz.{' '}
          <Link href="/gizlilik-politikasi#cerezler" className={styles.link}>
            Çerez politikası
          </Link>
        </p>
        <div className={styles.actions}>
          <button type="button" className="btn btn-secondary" onClick={() => choose('necessary')}>
            yalnızca gerekli
          </button>
          <button type="button" className="btn btn-primary" onClick={() => choose('all')}>
            tümünü kabul et
          </button>
        </div>
      </div>
    </section>
  )
}
