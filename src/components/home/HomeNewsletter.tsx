'use client'

import { useState } from 'react'
import Link from 'next/link'
import { NEWSLETTER_CONSENT_TEXT } from '@/lib/newsletter/consent'
import styles from './HomeNewsletter.module.css'

export default function HomeNewsletter() {
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    if (!consent) {
      setStatus('error')
      setMessage('Devam etmek için e-posta iletişim onayını işaretle.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, consent: true, source: 'homepage' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) throw new Error(data.error || 'Kaydın şu an alınamadı. Biraz sonra tekrar dene.')
      setStatus('success')
      setMessage(data.message)
      setEmail('')
    } catch (err) {
      setStatus('error')
      setMessage((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section id="bulten" className={styles.section} aria-label="zuulab bülteni">
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
            <span className={styles.perk}>abone olana %10 indirim kodu</span>
            <span className={styles.perk}>sınırlı serilere öncelikli erişim</span>
            <span className={styles.perk}>tek tıkla kolay iptal</span>
          </div>
        </div>

        <div className={styles.right}>
          {status === 'success' ? (
            <div className={styles.successMsg}>
              <span className={styles.successIcon}>✓</span>
              <p className={styles.successTitle}>neredeyse tamam.</p>
              <p className={styles.successSub}>{message}</p>
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
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (status === 'error') setStatus('idle')
                  }}
                  aria-invalid={status === 'error'}
                  aria-describedby={status === 'error' ? 'newsletter-error' : undefined}
                  placeholder="ornek@gmail.com"
                  required
                  className={styles.input}
                  disabled={loading}
                />
                <button type="submit" className={styles.submit} disabled={loading}>
                  {loading ? 'gönderiliyor...' : 'abone ol'}
                </button>
              </div>
              <label className={styles.consent}>
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => {
                    setConsent(e.target.checked)
                    if (status === 'error') setStatus('idle')
                  }}
                />
                <span>
                  {NEWSLETTER_CONSENT_TEXT}{' '}
                  <Link href="/gizlilik-politikasi" className={styles.privacyLink}>
                    gizlilik metni
                  </Link>
                </span>
              </label>
              {status === 'error' && (
                <p id="newsletter-error" className={styles.error} role="alert">
                  {message}
                </p>
              )}
              <p className={styles.privacy}>
                e-postana bir onay bağlantısı göndereceğiz; onayladığında %10 indirim kodun gelir. bilgilerin üçüncü taraflarla paylaşılmaz.
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}
