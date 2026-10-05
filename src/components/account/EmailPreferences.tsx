'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { EMAIL_PERMISSION_TEXT } from '@/lib/newsletter/consent'
import { useCommercialEmail } from '@/hooks/useCommercialEmail'

/**
 * "e-posta tercihleri" in Hesabım > Profilim: the one place a member can see and change whether
 * zuulab may send them commercial e-mail (campaigns, offers, reminders about an unpaid order,
 * review requests). Switching it off stops all commercial e-mail, the newsletter included;
 * order and shipping messages are never affected.
 */

type Status = 'NONE' | 'ACTIVE' | 'WITHDRAWN' | 'DECLINED'
type NewsletterStatus = 'ACTIVE' | 'PENDING' | 'UNSUBSCRIBED' | null

export default function EmailPreferences() {
  const { user, token } = useAuthStore()
  const commercial = useCommercialEmail()
  const [state, setState] = useState<{ status: Status; newsletter: NewsletterStatus; eligible: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!user || !token) return
    let cancelled = false
    fetch('/api/account/email-consent', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success) setState({ status: d.status, newsletter: d.newsletter ?? null, eligible: d.eligible === true })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [user, token])

  // Nothing to show while commercial e-mail is switched off
  if (!commercial || !user || !token || !state) return null

  const on = state.status === 'ACTIVE'

  const change = async (answer: 'accept' | 'withdraw') => {
    setBusy(true)
    setMessage('')
    try {
      const res = await fetch('/api/account/email-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ answer, from: 'account' }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.success) throw new Error(d.error || 'Tercihin kaydedilemedi. Biraz sonra tekrar dene.')
      setState((s) => (s ? { ...s, status: d.status, newsletter: answer === 'withdraw' && s.newsletter ? 'UNSUBSCRIBED' : s.newsletter } : s))
      setMessage(answer === 'accept' ? 'E-posta izni verildi.' : 'İznin geri alındı. Artık kampanya e-postası göndermeyeceğiz.')
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="email-prefs-title" style={{ display: 'grid', gap: 12, marginTop: 32 }}>
      <h2 id="email-prefs-title" style={{ margin: 0, fontSize: '1.1rem' }}>e-posta tercihleri</h2>
      <p style={{ margin: 0, opacity: 0.8 }}>
        Kampanya ve indirimler, sepetinle ya da siparişlerinle ilgili hatırlatmalar ve bülten e-postaları bu izne bağlıdır. Sipariş onayı ve
        kargo bilgilendirmeleri bu tercihten etkilenmez.
      </p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong>{on ? 'kampanya e-postaları: açık' : 'kampanya e-postaları: kapalı'}</strong>
        {on ? (
          <button type="button" className="btn btn-secondary" onClick={() => change('withdraw')} disabled={busy}>
            {busy ? 'kaydediliyor…' : 'kapat'}
          </button>
        ) : state.eligible ? (
          <button type="button" className="btn btn-primary" onClick={() => change('accept')} disabled={busy}>
            {busy ? 'kaydediliyor…' : 'aç'}
          </button>
        ) : (
          <span style={{ opacity: 0.8 }}>E-posta adresini doğruladıktan sonra açabilirsin.</span>
        )}
      </div>

      {!on && state.eligible && (
        <p style={{ margin: 0, fontSize: '0.85em', opacity: 0.75 }}>
          “{EMAIL_PERMISSION_TEXT}” Bu izin bülten aboneliği değildir.{' '}
          <Link href="/ticari-elektronik-ileti-onayi">Ayrıntılar</Link>
        </p>
      )}

      <p style={{ margin: 0, fontSize: '0.9em' }}>
        Bülten:{' '}
        {state.newsletter === 'ACTIVE'
          ? 'abonesin (bültene özel içerikleri alırsın)'
          : state.newsletter === 'PENDING'
            ? 'onay bekliyor (e-postandaki bağlantıya tıkla)'
            : state.newsletter === 'UNSUBSCRIBED'
              ? 'abone değilsin'
              : 'abone değilsin'}
        {state.newsletter !== 'ACTIVE' && state.newsletter !== 'PENDING' && (
          <>
            {' '}
            · <Link href="/#bulten">bültene katıl</Link>
          </>
        )}
      </p>

      {message && (
        <p role="status" style={{ margin: 0 }}>
          {message}
        </p>
      )}
    </section>
  )
}
