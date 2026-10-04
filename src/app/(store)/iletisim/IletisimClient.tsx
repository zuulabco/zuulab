'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import styles from '../ContentPage.module.css'
import { track } from '@/lib/analytics/gtag'

export default function IletisimClient() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sends the message to /api/contact, which files it as a support ticket and
  // alerts the team; success is only shown once the server has stored it.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, subject, message, website }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        setError(data.error || 'Mesajınız gönderilemedi. Lütfen tekrar deneyin.')
        return
      }
      track('generate_lead', { lead_source: 'iletişim formu' })
      setSubmitted(true)
      setName('')
      setEmail('')
      setSubject('')
      setMessage('')
    } catch {
      setError('Bağlantı hatası. Lütfen internet bağlantınızı kontrol edip tekrar deneyin.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.contactForm}>
        <h2 className={styles.formTitle}>mesaj gönderin</h2>

        {submitted ? (
          <div className={styles.formSuccess}>
            <strong>mesajınız alındı.</strong><br />
            Talebiniz ekibimize iletilmiştir. En kısa sürede e-posta adresiniz
            üzerinden geri dönüş sağlanacaktır.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className={styles.formGrid}>
            {/* Honeypot for bots; hidden from people and assistive tech. */}
            <input
              type="text"
              name="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, opacity: 0 }}
            />
            <div className={styles.formGroup}>
              <label htmlFor="iletisim-name" className={styles.formLabel}>
                ad soyad *
              </label>
              <input
                id="iletisim-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ahmet Yılmaz"
                className={styles.formInput}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="iletisim-email" className={styles.formLabel}>
                e-posta *
              </label>
              <input
                id="iletisim-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ahmet@example.com"
                className={styles.formInput}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="iletisim-subject" className={styles.formLabel}>
                konu *
              </label>
              <input
                id="iletisim-subject"
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Özel boyutlu baskı talebi"
                className={styles.formInput}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="iletisim-message" className={styles.formLabel}>
                mesajınız *
              </label>
              <textarea
                id="iletisim-message"
                required
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Projenizi veya sorunuzu detaylı olarak açıklayınız..."
                className={styles.formTextarea}
              />
            </div>

            {error && (
              <p role="alert" className={styles.formGroup} style={{ color: 'var(--status-error, #c0392b)', margin: 0 }}>
                {error}
              </p>
            )}

            <div className={styles.formGroup}>
              <button
                type="submit"
                disabled={submitting}
                className={styles.formSubmit}
              >
                {submitting ? 'gönderiliyor...' : 'gönder'}
              </button>
              <p className={styles.formNote}>
                Mesajınızdaki kişisel veriler yalnızca talebinizi yanıtlamak için{' '}
                <Link href="/kvkk-aydinlatma-metni">KVKK aydınlatma metni</Link> kapsamında işlenir.
              </p>
            </div>
          </form>
        )}
    </div>
  )
}
