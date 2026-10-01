'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import styles from './Basarisiz.module.css'

export default function BasarisizClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const orderNumber = searchParams.get('order') || ''
  const reason =
    searchParams.get('reason') ||
    'kart bakiyesi yetersiz veya işlem banka tarafından onaylanmadı.'

  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)

  const handleRetry = async () => {
    if (!orderNumber) {
      router.push('/odeme')
      return
    }

    setRetrying(true)
    setRetryError(null)

    try {
      const res = await fetch('/api/payments/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber }),
      })

      const data = await res.json()
      if (data.success && data.checkoutUrl) {
        window.location.href = data.checkoutUrl
      } else {
        setRetryError(data.error || 'Ödeme oturumu yenilenemedi.')
      }
    } catch {
      setRetryError('Bağlantı hatası oluştu. Lütfen tekrar deneyin.')
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.statusIconWrap} aria-hidden="true">
        ✕
      </div>

      <h1 className={styles.title}>ödeme tamamlanamadı.</h1>

      <p className={styles.subtitle}>
        kartınızdan herhangi bir çekim yapılmadı. sepetinizdeki ürünler korunmaktadır.
      </p>

      <div className={styles.errorCard}>
        <div className={styles.bankReasonTitle}>banka yanıtı</div>
        <div className={styles.bankReasonText}>{reason.toLowerCase()}</div>
        {orderNumber && (
          <div className={styles.orderReference}>
            referans sipariş no: #{orderNumber}
          </div>
        )}
      </div>

      {retryError && (
        <div className={styles.retryErrorBanner}>
          {retryError}
        </div>
      )}

      <div className={styles.actionsRow}>
        <button
          onClick={handleRetry}
          disabled={retrying}
          className={styles.primaryBtn}
        >
          {retrying ? 'oturum yenileniyor...' : 'ödemeyi tekrar dene'}
        </button>
        <Link href="/sepet" className={styles.secondaryBtn}>
          sepete dön
        </Link>
      </div>
    </div>
  )
}
