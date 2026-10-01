'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import styles from '../ContentPage.module.css'

export default function IletisimClient() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setTimeout(() => {
      setSubmitting(false)
      setSubmitted(true)
      setName('')
      setEmail('')
      setSubject('')
      setMessage('')
    }, 600)
  }

  return (
    <div className={styles.contactLayout}>
      {/* Sol: İletişim kanalları */}
      <div>
        <div className={styles.contactChannel}>
          <span className={styles.contactChannelLabel}>e-posta</span>
          <a href="mailto:info@zuulab.com" className={styles.contactChannelValue}>
            info@zuulab.com
          </a>
          <span className={styles.contactChannelNote}>
            Genel sorular ve sipariş bilgileri için
          </span>
        </div>

        <div className={styles.contactChannel}>
          <span className={styles.contactChannelLabel}>telefon</span>
          <a href="tel:+905001234567" className={styles.contactChannelValue}>
            +90 500 123 45 67
          </a>
          <span className={styles.contactChannelNote}>
            Hafta içi 09:00 – 18:00
          </span>
        </div>

        <div className={styles.contactChannel}>
          <span className={styles.contactChannelLabel}>atölye & üretim merkezi</span>
          <span className={styles.contactChannelValue}>
            Kadıköy, İstanbul
          </span>
          <span className={styles.contactChannelNote}>
            Ziyaret için önceden randevu alınız
          </span>
        </div>

        <div className={styles.contactChannel}>
          <span className={styles.contactChannelLabel}>instagram</span>
          <a
            href="https://instagram.com/zuulab"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.contactChannelValue}
          >
            @zuulab
          </a>
          <span className={styles.contactChannelNote}>
            Ürün güncellemeleri ve atölye içerikleri
          </span>
        </div>

        <div className={styles.contactChannel}>
          <span className={styles.contactChannelLabel}>destek talebi</span>
          <Link href="/hesap/destek" className={styles.contactChannelValue}>
            hesap / destek →
          </Link>
          <span className={styles.contactChannelNote}>
            Mevcut siparişleriniz için doğrudan destek talebi açın
          </span>
        </div>

        <div className={styles.contactChannel} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <span className={styles.contactChannelLabel}>toptan & özel üretim</span>
          <a href="mailto:info@zuulab.com" className={styles.contactChannelValue}>
            info@zuulab.com
          </a>
          <span className={styles.contactChannelNote}>
            Kurumsal ve toptan talepler için e-posta ile ulaşın
          </span>
        </div>
      </div>

      {/* Sağ: İletişim formu */}
      <div>
        <h2 className={styles.formTitle}>mesaj gönderin</h2>

        {submitted ? (
          <div className={styles.formSuccess}>
            <strong>mesajınız alındı.</strong><br />
            Talebiniz ekibimize iletilmiştir. En kısa sürede e-posta adresiniz
            üzerinden geri dönüş sağlanacaktır.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className={styles.formGrid}>
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

            <div className={styles.formGroup}>
              <button
                type="submit"
                disabled={submitting}
                className={styles.formSubmit}
              >
                {submitting ? 'gönderiliyor...' : 'gönder'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
