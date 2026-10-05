'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Modal from '@/components/common/Modal'
import { useAuthStore } from '@/store/authStore'
import { EMAIL_PERMISSION_TEXT } from '@/lib/newsletter/consent'
import { useCommercialEmail } from '@/hooks/useCommercialEmail'

/**
 * Asks a signed-in member, once, for permission to send commercial e-mail (reminders about an
 * unpaid order, offers). It is not the newsletter and does not subscribe anyone to it.
 *
 * - Shown only when the member has not answered yet and their e-mail address is verified.
 * - "evet" gives the permission, "hayır" is saved so no device asks again.
 * - Closing it without answering (X, Esc, outside click) gives no permission and is not saved on the
 *   server; this browser asks again after 14 days. Until they say yes, nothing is sent.
 * - Never opens on the payment pages, so it cannot interrupt a payment.
 * - Never opens while commercial e-mail is switched off (COMMERCIAL_EMAIL_ENABLED).
 */

const SNOOZE_KEY = 'zuulab_email_consent_snooze'
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000

function snoozed(): boolean {
  try {
    const at = Number(localStorage.getItem(SNOOZE_KEY))
    return Number.isFinite(at) && at > 0 && Date.now() - at < SNOOZE_MS
  } catch {
    return false
  }
}

function snooze(): void {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now()))
  } catch {
    // storage blocked: it simply asks again next time
  }
}

export default function EmailConsentModal() {
  const { user, token } = useAuthStore()
  const pathname = usePathname()
  const commercial = useCommercialEmail()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!commercial || !user || !token || snoozed()) return
    let cancelled = false
    fetch('/api/account/email-consent', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success && d.status === 'NONE' && d.eligible === true) setOpen(true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [commercial, user, token])

  const blocked = pathname.startsWith('/odeme')

  const close = () => {
    snooze()
    setOpen(false)
  }

  const answer = async (value: 'accept' | 'decline') => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/account/email-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ answer: value }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.success) throw new Error(d.error || 'Tercihin kaydedilemedi. Biraz sonra tekrar dene.')
      setOpen(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal isOpen={commercial && open && !blocked} onClose={close} ariaLabel="E-posta izni" maxWidth={460}>
      <div style={{ display: 'grid', gap: 14, padding: '8px 4px' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem' }}>e-posta ile haberdar olmak ister misin?</h2>
        <p style={{ margin: 0 }}>
          Sana özel kampanyaları, indirimleri ve sepetinle ya da siparişlerinle ilgili hatırlatmaları e-posta ile göndermek için iznini
          istiyoruz. İzin vermezsen bu e-postaları göndermeyiz; sipariş ve kargo bilgilendirmeleri etkilenmez.
        </p>
        <p style={{ margin: 0, fontSize: '0.85em', opacity: 0.75 }}>
          “{EMAIL_PERMISSION_TEXT}” Bu izin bülten aboneliği değildir. İznini dilediğin zaman, her e-postadaki bağlantıdan geri alabilirsin.{' '}
          <Link href="/ticari-elektronik-ileti-onayi">Ayrıntılar</Link>
        </p>
        {error && (
          <p role="alert" style={{ margin: 0, color: 'var(--error, #b42318)' }}>
            {error}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={() => answer('accept')} disabled={busy}>
            {busy ? 'kaydediliyor…' : 'evet, izin veriyorum'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => answer('decline')} disabled={busy}>
            hayır, teşekkürler
          </button>
        </div>
      </div>
    </Modal>
  )
}
