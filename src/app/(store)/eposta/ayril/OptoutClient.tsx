'use client'

import { useState } from 'react'
import Link from 'next/link'
import styles from '../../bulten/Bulten.module.css'

export default function OptoutClient({ e, s }: { e: string; s: string }) {
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>(e && s ? 'idle' : 'error')

  const optOut = async () => {
    setState('working')
    try {
      const res = await fetch('/api/email/optout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ e, s }),
      })
      setState(res.ok ? 'done' : 'error')
    } catch {
      setState('error')
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {state === 'done' ? (
          <>
            <h1 className={styles.title}>tercihin kaydedildi.</h1>
            <p className={styles.text}>Artık değerlendirme isteği gibi e-postalar göndermeyeceğiz. Sipariş ve kargo bilgilendirmeleri gelmeye devam eder.</p>
            <Link href="/" className="btn btn-primary btn-lg">
              ana sayfaya dön
            </Link>
          </>
        ) : state === 'error' ? (
          <>
            <h1 className={styles.title}>bağlantı geçersiz.</h1>
            <p className={styles.text}>Bağlantı eksik ya da artık geçerli değil. Bu e-postaları almak istemiyorsan bize yaz, hemen halledelim.</p>
            <Link href="/iletisim" className="btn btn-secondary btn-lg">
              iletişim
            </Link>
          </>
        ) : (
          <>
            <h1 className={styles.title}>bu e-postaları istemiyor musun?</h1>
            <p className={styles.text}>Siparişinle ilgili değerlendirme isteği gibi e-postaları artık göndermeyeceğiz. Sipariş ve kargo bilgilendirmeleri etkilenmez.</p>
            <div className={styles.actions}>
              <button type="button" className="btn btn-primary btn-lg" onClick={optOut} disabled={state === 'working'}>
                {state === 'working' ? 'işleniyor…' : 'evet, istemiyorum'}
              </button>
              <Link href="/" className="btn btn-secondary btn-lg">
                vazgeç
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
