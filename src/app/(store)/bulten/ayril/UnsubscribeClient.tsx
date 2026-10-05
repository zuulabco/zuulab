'use client'

import { useState } from 'react'
import Link from 'next/link'
import styles from '../Bulten.module.css'

export default function UnsubscribeClient({ token, message }: { token: string; message?: string }) {
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>(token ? 'idle' : 'error')

  const unsubscribe = async () => {
    setState('working')
    try {
      const res = await fetch('/api/newsletter/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, message }),
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
            <h1 className={styles.title}>bültenden ayrıldın.</h1>
            <p className={styles.text}>Artık bülten, kampanya ve sepet hatırlatması e-postaları almayacaksın. Sipariş ve kargo bildirimlerin gelmeye devam eder.</p>
            <Link href="/" className="btn btn-primary btn-lg">
              ana sayfaya dön
            </Link>
          </>
        ) : state === 'error' ? (
          <>
            <h1 className={styles.title}>bağlantı geçersiz.</h1>
            <p className={styles.text}>
              Bağlantı eksik ya da artık geçerli değil. Bülteni hâlâ alıyorsan e-postadaki &quot;bültenden ayrıl&quot;
              bağlantısını yeniden dene ya da bize yaz.
            </p>
            <Link href="/iletisim" className="btn btn-secondary btn-lg">
              iletişim
            </Link>
          </>
        ) : (
          <>
            <h1 className={styles.title}>bültenden ayrılmak istiyor musun?</h1>
            <p className={styles.text}>Yeni tasarım, kampanya ve sepet hatırlatması e-postalarını artık almayacaksın. Dilediğin zaman tekrar katılabilirsin.</p>
            <div className={styles.actions}>
              <button type="button" className="btn btn-primary btn-lg" onClick={unsubscribe} disabled={state === 'working'}>
                {state === 'working' ? 'işleniyor…' : 'bültenden ayrıl'}
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
