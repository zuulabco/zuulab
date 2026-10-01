'use client'

import { useState } from 'react'
import Link from 'next/link'
import styles from './HomeNewsletter.module.css'

export default function HomeNewsletter() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    await new Promise((r) => setTimeout(r, 700))
    setStatus('success')
    setLoading(false)
    setEmail('')
  }

  return (
    <section className={styles.section} aria-label="zuulab bülteni">
      <div className={styles.container}>
        <div className={styles.left}>
          <h2 className={styles.title}>
            yeni formlardan<br />
            <span className={styles.titleItalic}>ilk siz haberdar olun.</span>
          </h2>
          <p className={styles.desc}>
            ayda en fazla iki bülten. yeni 3d koleksiyonlar, özel üretim güncellemeleri 
            ve sınırlı seri tasarımlar. spam yok.
          </p>
          <div className={styles.perks}>
            <span className={styles.perk}>ilk siparişe özel %10 indirim</span>
            <span className={styles.perk}>sınırlı serilere öncelikli erişim</span>
            <span className={styles.perk}>tek tıkla kolay iptal</span>
          </div>
        </div>

        <div className={styles.right}>
          {status === 'success' ? (
            <div className={styles.successMsg}>
              <span className={styles.successIcon}>✓</span>
              <p className={styles.successTitle}>kaydınız alındı.</p>
              <p className={styles.successSub}>
                yeni tasarımlar yayına girdiğinde e-posta kutunuzda olacağız.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className={styles.form}>
              <label htmlFor="newsletter-email" className={styles.label}>
                e-posta adresiniz
              </label>
              <div className={styles.inputRow}>
                <input
                  id="newsletter-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ornek@alanadi.com"
                  required
                  className={styles.input}
                  disabled={loading}
                />
                <button type="submit" className={styles.submit} disabled={loading}>
                  {loading ? 'gönderiliyor...' : 'abone ol'}
                </button>
              </div>
              <p className={styles.privacy}>
                bilgileriniz üçüncü taraflarla paylaşılmaz.
                <Link href="/gizlilik-politikasi" className={styles.privacyLink}>
                  gizlilik metni
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}
