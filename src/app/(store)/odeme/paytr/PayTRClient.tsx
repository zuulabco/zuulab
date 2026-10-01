'use client'

import React, { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import Script from 'next/script'
import { useSearchParams, useRouter } from 'next/navigation'
import styles from './PayTR.module.css'

declare global {
  interface Window {
    iFrameResize?: (options: Record<string, unknown>, selector: string) => void
  }
}

export default function PayTRClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const orderNumber = searchParams.get('order') || ''
  const isSimulated = searchParams.get('simulated') === 'true' || Boolean(token && token.length === 64)

  const [loading, setLoading] = useState(true)
  const [iframeError, setIframeError] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const resizerInitializedRef = useRef(false)

  const iframeSrc = token ? `https://www.paytr.com/odeme/guvenli/${encodeURIComponent(token)}` : ''

  const handleScriptLoad = () => {
    if (window.iFrameResize && !resizerInitializedRef.current) {
      try {
        window.iFrameResize({}, '#paytriframe')
        resizerInitializedRef.current = true
      } catch (err) {
        console.warn('[PayTR] iFrameResize initialization notice:', err)
      }
    }
  }

  const handleIframeLoad = () => {
    setLoading(false)
    if (window.iFrameResize && !resizerInitializedRef.current) {
      try {
        window.iFrameResize({}, '#paytriframe')
        resizerInitializedRef.current = true
      } catch (err) {
        console.warn('[PayTR] iFrameResize on load notice:', err)
      }
    }
  }

  // Handle simulation actions for test environment
  const handleSimulatePayment = async (status: 'SUCCESS' | 'FAILED') => {
    if (simulating || !orderNumber) return
    setSimulating(true)

    try {
      const res = await fetch('/api/payments/process-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber,
          simulateStatus: status,
          failureReason: status === 'FAILED' ? 'Test ortamı simüle edilmiş bakiye yetersiz hatası.' : undefined,
        }),
      })

      const data = await res.json()
      if (status === 'SUCCESS' && data.success) {
        router.push(`/odeme/basarili?order=${encodeURIComponent(orderNumber)}`)
      } else {
        router.push(
          `/odeme/basarisiz?order=${encodeURIComponent(orderNumber)}&reason=${encodeURIComponent(
            data.message || 'Ödeme tamamlanamadı.'
          )}`
        )
      }
    } catch {
      router.push(`/odeme/basarisiz?order=${encodeURIComponent(orderNumber)}&reason=Simulasyon+hatasi`)
    } finally {
      setSimulating(false)
    }
  }

  if (!token) {
    return (
      <div className={styles.container}>
        <div className={styles.errorBox}>
          <div className={styles.errorTitle}>Geçersiz Ödeme Oturumu</div>
          <p className={styles.errorDesc}>
            Ödeme oturum belirteci (token) bulunamadı veya süresi dolmuş. Lütfen sepetinize dönerek ödemeyi tekrar başlatın.
          </p>
          <Link href="/odeme" className={styles.returnBtn}>
            Ödeme Sayfasına Dön
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <Script
        src="https://www.paytr.com/js/iframeResizer.min.js"
        strategy="lazyOnload"
        onLoad={handleScriptLoad}
      />

      <header className={styles.header}>
        <h1 className={styles.title}>güvenli ödeme</h1>
        <p className={styles.subtitle}>
          Kart bilgileriniz 256-bit SSL ve BDDK lisanslı PayTR 3D Secure altyapısıyla işlenmektedir.
        </p>
        {orderNumber && (
          <div className={styles.orderBadge}>
            sipariş no: #{orderNumber}
          </div>
        )}
      </header>

      {/* Test / Sandbox simulation helper banner */}
      {isSimulated && (
        <aside className={styles.simulatedBox} aria-label="Geliştirme Test Alanı">
          <span className={styles.simulatedBadge}>Test / Simülasyon Modu</span>
          <p className={styles.simulatedText}>
            Canlı PayTR kimlik bilgileri yapılandırılmadığı için simülasyon modundasınız. Canlı ortamda gerçek PayTR 3D Secure formu aşağıda yüklenecektir.
          </p>
          <div className={styles.simulatedActions}>
            <button
              type="button"
              disabled={simulating}
              className={styles.simulatedBtnSuccess}
              onClick={() => handleSimulatePayment('SUCCESS')}
            >
              {simulating ? 'İşleniyor...' : '✓ Başarılı Ödeme Simüle Et'}
            </button>
            <button
              type="button"
              disabled={simulating}
              className={styles.simulatedBtnFail}
              onClick={() => handleSimulatePayment('FAILED')}
            >
              {simulating ? 'İşleniyor...' : '✕ Başarısız Ödeme Simüle Et'}
            </button>
          </div>
        </aside>
      )}

      {/* PayTR Secure Iframe Container */}
      <div className={styles.iframeWrapper}>
        {loading && (
          <div className={styles.loadingOverlay}>
            <div className={styles.spinner} />
            <span>PayTR güvenli ödeme ekranı yükleniyor...</span>
          </div>
        )}

        <iframe
          src={iframeSrc}
          id="paytriframe"
          title="PayTR 3D Secure Güvenli Ödeme Ekranı"
          className={styles.iframe}
          scrolling="no"
          onLoad={handleIframeLoad}
          onError={() => {
            setLoading(false)
            setIframeError(true)
          }}
        />

        {iframeError && (
          <div className={styles.errorBox}>
            <div className={styles.errorTitle}>PayTR Ekranı Yüklenemedi</div>
            <p className={styles.errorDesc}>
              Ödeme sağlayıcısına bağlanırken bir sorun oluştu. Lütfen bağlantınızı kontrol edip tekrar deneyin.
            </p>
            <Link href="/odeme" className={styles.returnBtn}>
              Tekrar Dene
            </Link>
          </div>
        )}
      </div>

      {/* Security Assurance */}
      <footer className={styles.securityBar}>
        <div className={styles.securityItem}>
          <span>🔒</span>
          <span>256-Bit SSL Sertifikalı Güvenli Ödeme</span>
        </div>
        <div className={styles.securityItem}>
          <span>🛡️</span>
          <span>PayTR 3D Secure Güvencesi</span>
        </div>
        <div className={styles.securityItem}>
          <span>⚡</span>
          <span>BDDK Lisanslı Ödeme Hizmeti</span>
        </div>
      </footer>
    </div>
  )
}
