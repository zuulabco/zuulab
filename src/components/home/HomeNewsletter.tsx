'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { NEWSLETTER_CONSENT_TEXT } from '@/lib/newsletter/consent'
import { useAuthStore } from '@/store/authStore'
import styles from './HomeNewsletter.module.css'
import { track } from '@/lib/analytics/gtag'

type MemberStatus = 'ACTIVE' | 'PENDING' | 'UNSUBSCRIBED' | null

/**
 * Newsletter sign-up. Guests type an address; signed-in members get a one-tap
 * button that sends the confirmation link to their account address (read from the
 * session on the server), with the option to use a different address instead.
 * Every route is double opt-in and needs the consent box.
 */
export default function HomeNewsletter() {
  const { user, token } = useAuthStore()
  const [member, setMember] = useState<{ email: string; status: MemberStatus } | null>(null)
  /** Signed-in member chose to type another address */
  const [otherEmail, setOtherEmail] = useState(false)

  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  // The member's own subscription state decides what the box offers
  useEffect(() => {
    if (!user || !token) return
    let cancelled = false
    fetch('/api/newsletter/me', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success) setMember({ email: d.email, status: d.status ?? null })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [user, token])

  const signedIn = Boolean(user && token && member)
  const useAccount = signedIn && !otherEmail

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!useAccount && !email) return
    if (!consent) {
      setStatus('error')
      setMessage('Devam etmek için e-posta iletişim onayını işaretle.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(useAccount ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(
          useAccount
            ? { useAccountEmail: true, consent: true, source: 'homepage-member' }
            : { email, consent: true, source: 'homepage' }
        ),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) throw new Error(data.error || 'Kaydın şu an alınamadı. Biraz sonra tekrar dene.')
      track('sign_up', { method: 'bülten' })
      setStatus('success')
      setMessage(data.message)
      setEmail('')
      if (useAccount && member && data.outcome !== 'already_active') setMember({ ...member, status: 'PENDING' })
    } catch (err) {
      setStatus('error')
      setMessage((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const consentBox = (
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
        <Link href="/ticari-elektronik-ileti-onayi" className={styles.privacyLink}>
          onay metni
        </Link>
        {' · '}
        <Link href="/kvkk-aydinlatma-metni" className={styles.privacyLink}>
          kvkk aydınlatma metni
        </Link>
      </span>
    </label>
  )

  const errorLine =
    status === 'error' ? (
      <p id="newsletter-error" className={styles.error} role="alert">
        {message}
      </p>
    ) : null

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
          ) : useAccount && member?.status === 'ACTIVE' ? (
            <div className={styles.form}>
              <div className={styles.accountBox}>
                <span className={styles.label}>bülten aboneliğin aktif</span>
                <strong className={styles.accountEmail}>{member.email}</strong>
                <p className={styles.privacy}>yeni koleksiyonlar ve kampanyalar bu adrese gelecek.</p>
              </div>
              <button type="button" className={styles.linkButton} onClick={() => setOtherEmail(true)}>
                farklı e-posta adresi girmek istiyorum
              </button>
            </div>
          ) : useAccount && member ? (
            <form onSubmit={submit} className={styles.form}>
              <div className={styles.accountBox}>
                <span className={styles.label}>hesabına kayıtlı e-posta</span>
                <strong className={styles.accountEmail}>{member.email}</strong>
              </div>
              <button type="submit" className={`${styles.submit} ${styles.submitWide}`} disabled={loading}>
                {loading ? 'gönderiliyor...' : member.status === 'PENDING' ? 'onay e-postasını tekrar gönder' : 'abone ol'}
              </button>
              {consentBox}
              {errorLine}
              <button
                type="button"
                className={styles.linkButton}
                onClick={() => {
                  setOtherEmail(true)
                  setStatus('idle')
                }}
              >
                farklı e-posta adresi girmek istiyorum
              </button>
              <p className={styles.privacy}>
                {member.status === 'PENDING'
                  ? 'onay bağlantısını henüz tıklamadın; gelen kutunu (ve gereksiz klasörünü) kontrol et.'
                  : 'bu adrese bir onay bağlantısı göndereceğiz; onayladığında %10 indirim kodun gelir.'}
              </p>
            </form>
          ) : (
            <form onSubmit={submit} className={styles.form}>
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
                  placeholder="e-posta adresini yaz"
                  required
                  className={styles.input}
                  disabled={loading}
                  autoFocus={otherEmail}
                />
                <button type="submit" className={styles.submit} disabled={loading}>
                  {loading ? 'gönderiliyor...' : 'abone ol'}
                </button>
              </div>
              {consentBox}
              {errorLine}
              {signedIn && (
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => {
                    setOtherEmail(false)
                    setStatus('idle')
                  }}
                >
                  hesabımın e-postasını kullan
                </button>
              )}
              <p className={styles.privacy}>
                e-postana bir onay bağlantısı göndereceğiz; onayladığında %10 indirim kodun gelir. bilgilerin üçüncü taraflarla
                paylaşılmaz.
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}
