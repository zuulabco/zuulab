'use client'

import React, { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import styles from '../../admin.module.css'

interface FulfillmentItem {
  id: string
  orderNumber: string | null
  marketplaceOrderNumber: string | null
  channel: string
  status: string
  items?: Array<{
    id: string
    productId: string
    sku: string
    barcode: string | null
    productNameSnapshot: string
    orderedQuantity: number
    pickedQuantity: number
    status: string
  }>
}

export default function WarehousePickingPage() {
  const router = useRouter()
  const { token, user, canFetch } = useAuthStore()

  const [fulfillments, setFulfillments] = useState<FulfillmentItem[]>([])
  const [activeFulfillment, setActiveFulfillment] = useState<FulfillmentItem | null>(null)
  const [barcodeInput, setBarcodeInput] = useState('')
  const [scanning, setScanning] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastScanned, setLastScanned] = useState<any>(null)

  const barcodeInputRef = useRef<HTMLInputElement>(null)

  // Focus barcode input continuously
  const focusScanner = () => {
    setTimeout(() => {
      barcodeInputRef.current?.focus()
    }, 50)
  }

  const fetchFulfillments = async () => {
    if (!canFetch) return
    try {
      const res = await fetch('/api/admin/warehouse?status=READY_TO_PICK', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success && data.fulfillments) {
        // Also fetch PICKING status fulfillments
        const res2 = await fetch('/api/admin/warehouse?status=PICKING', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data2 = await res2.json()
        const combined = [...(data2.fulfillments || []), ...(data.fulfillments || [])]
        setFulfillments(combined)
        if (!activeFulfillment && combined.length > 0) {
          setActiveFulfillment(combined[0])
        }
      }
    } catch {
      setError('Toplama listeleri yüklenemedi.')
    }
  }

  useEffect(() => {
    fetchFulfillments()
  }, [token, canFetch, canFetch])

  useEffect(() => {
    focusScanner()
  }, [activeFulfillment])

  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const barcode = barcodeInput.trim()
    if (!barcode || !activeFulfillment || !canFetch) return

    setScanning(true)
    setError(null)
    setMessage(null)

    try {
      const clientRequestId = `req_pick_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      const res = await fetch(`/api/admin/warehouse/fulfillments/${activeFulfillment.id}/scan`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          barcode,
          clientRequestId,
          quantity: 1,
        }),
      })

      const data = await res.json()
      if (data.success) {
        setLastScanned(data)
        setMessage(
          `${data.productName} (${data.sku}) okutuldu. [${data.pickedQuantity} / ${data.orderedQuantity}]`
        )

        // Update local item quantity immediately
        setActiveFulfillment((prev) => {
          if (!prev) return null
          const nextItems = (prev.items || []).map((it) => {
            if (it.sku.toUpperCase() === data.sku.toUpperCase()) {
              return { ...it, pickedQuantity: data.pickedQuantity }
            }
            return it
          })
          return { ...prev, items: nextItems }
        })
      } else {
        setError(data.error || 'Okutma başarısız.')
      }
    } catch {
      setError('Barkod tarayıcı servisine ulaşılamadı.')
    } finally {
      setBarcodeInput('')
      setScanning(false)
      focusScanner()
    }
  }

  const handleCompletePicking = async () => {
    if (!activeFulfillment || !canFetch) return
    setCompleting(true)
    setMessage(null)
    setError(null)

    try {
      const res = await fetch(
        `/api/admin/warehouse/fulfillments/${activeFulfillment.id}/complete-picking`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      const data = await res.json()
      if (data.success) {
        setMessage('Toplama işlemi başarıyla tamamlandı. Paketleme masasına yönlendiriliyorsunuz...')
        setTimeout(() => {
          router.push('/admin/warehouse/packing')
        }, 1200)
      } else {
        setError(data.error || 'Toplama tamamlanamadı.')
      }
    } catch {
      setError('Servise ulaşılamadı.')
    } finally {
      setCompleting(false)
    }
  }

  const items = activeFulfillment?.items || []
  const totalOrdered = items.reduce((acc, it) => acc + it.orderedQuantity, 0)
  const totalPicked = items.reduce((acc, it) => acc + it.pickedQuantity, 0)
  const isFullyPicked = items.length > 0 && items.every((it) => it.pickedQuantity === it.orderedQuantity)

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Toplama Masası (Warehouse Picking Station)</h1>
          <p className={styles.subtitle}>
            El terminali veya barkod okuyucu ile ürünleri toplayın ve doğrulayın
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/admin/warehouse" className={styles.btnSecondary}>
            ← Depo Paneline Dön
          </Link>
          <Link href="/admin/warehouse/packing" className={styles.btnPrimary}>
            Paketlemeye Geç →
          </Link>
        </div>
      </div>

      {message && <div className={styles.alertSuccess}>{message}</div>}
      {error && <div className={styles.alertDanger}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20 }}>
        {/* Left: Active Fulfillment Selection */}
        <div className={styles.card}>
          <h3 style={{ fontSize: 14, marginBottom: 12, fontWeight: 600 }}>
            Toplama Kuyruğu ({fulfillments.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {fulfillments.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Toplama bekleyen aktif sipariş yok.
              </div>
            ) : (
              fulfillments.map((f) => {
                const isActive = activeFulfillment?.id === f.id
                const orderNum = f.orderNumber || f.marketplaceOrderNumber || f.id
                return (
                  <div
                    key={f.id}
                    onClick={() => setActiveFulfillment(f)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 6,
                      border: isActive ? '2px solid #2563eb' : '1px solid #e5e7eb',
                      backgroundColor: isActive ? '#eff6ff' : '#ffffff',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <strong style={{ fontSize: 13 }}>{orderNum}</strong>
                      <span style={{ fontSize: 11, color: '#6b7280' }}>{f.channel}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#4b5563', marginTop: 4 }}>
                      {f.items?.length || 0} Kalem Ürün
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Right: Scanner & Active Picking Console */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {activeFulfillment ? (
            <>
              {/* Large Scanner Input Box */}
              <div
                className={styles.card}
                style={{
                  border: '2px solid #3b82f6',
                  backgroundColor: '#f8fafc',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: '#1e40af' }}>
                      BARKOD TARAYICI (USB / BLUETOOTH / KLAVYE)
                    </span>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#dbeafe', color: '#1e40af', fontWeight: 600 }}>
                      Mevcut Lokasyon: MAIN-A-01-R01-S01-B01
                    </span>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#f1f5f9', color: '#475569' }}>
                      Sonraki: MAIN-A-01-R01-S02-B02
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 12, background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>
                      ⏱️ Kesim: ~01:42
                    </span>
                    <span style={{ fontSize: 12, color: '#64748b' }}>
                      Sipariş: #{activeFulfillment.orderNumber || activeFulfillment.marketplaceOrderNumber}
                    </span>
                  </div>
                </div>

                <form onSubmit={handleScanSubmit} style={{ display: 'flex', gap: 10 }}>
                  <input
                    ref={barcodeInputRef}
                    type="text"
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    placeholder="Ürün Barkodunu veya SKU'sunu Okutunuz [ENTER]..."
                    disabled={scanning}
                    autoFocus
                    style={{
                      flex: 1,
                      padding: '14px 16px',
                      fontSize: 18,
                      fontWeight: 600,
                      borderRadius: 8,
                      border: '2px solid #cbd5e1',
                      outline: 'none',
                      backgroundColor: '#ffffff',
                    }}
                  />
                  <button
                    type="submit"
                    disabled={scanning || !barcodeInput.trim()}
                    className={styles.btnPrimary}
                    style={{ padding: '0 24px', fontSize: 15 }}
                  >
                    {scanning ? 'İşleniyor...' : 'Okut'}
                  </button>
                </form>

                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>
                    Toplanan: <strong>{totalPicked}</strong> / {totalOrdered} Adet
                  </span>
                  <span>
                    İlerleme: <strong>{totalOrdered > 0 ? Math.round((totalPicked / totalOrdered) * 100) : 0}%</strong>
                  </span>
                </div>

                {/* Progress Bar */}
                <div
                  style={{
                    height: 10,
                    width: '100%',
                    backgroundColor: '#e2e8f0',
                    borderRadius: 5,
                    overflow: 'hidden',
                    marginTop: 8,
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${totalOrdered > 0 ? Math.min(100, (totalPicked / totalOrdered) * 100) : 0}%`,
                      backgroundColor: isFullyPicked ? '#10b981' : '#3b82f6',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>

              {/* Items List */}
              <div className={styles.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600 }}>Toplanacak Ürün Listesi</h3>
                  {isFullyPicked ? (
                    <span style={{ color: '#059669', fontWeight: 600, fontSize: 13 }}>
                      Tüm ürünler toplandı
                    </span>
                  ) : null}
                </div>

                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Ürün Adı</th>
                      <th>SKU</th>
                      <th>Barkod</th>
                      <th>Gereken</th>
                      <th>Toplanan</th>
                      <th>Kalan</th>
                      <th>Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => {
                      const isComplete = it.pickedQuantity === it.orderedQuantity
                      return (
                        <tr
                          key={it.id}
                          style={{
                            backgroundColor: isComplete ? '#f0fdf4' : 'inherit',
                          }}
                        >
                          <td>
                            <strong>{it.productNameSnapshot}</strong>
                          </td>
                          <td>
                            <code>{it.sku}</code>
                          </td>
                          <td>
                            <code>{it.barcode || '-'}</code>
                          </td>
                          <td>{it.orderedQuantity}</td>
                          <td style={{ fontWeight: 600, color: isComplete ? '#15803d' : '#2563eb' }}>
                            {it.pickedQuantity}
                          </td>
                          <td style={{ color: it.orderedQuantity - it.pickedQuantity > 0 ? '#b91c1c' : '#15803d' }}>
                            {it.orderedQuantity - it.pickedQuantity}
                          </td>
                          <td>
                            {isComplete ? (
                              <span className={`${styles.badge} ${styles.badgeSuccess}`}>
                                Tamamlandı
                              </span>
                            ) : (
                              <span className={`${styles.badge} ${styles.badgeWarning}`}>
                                Bekliyor
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                {/* Completion Action */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    marginTop: 20,
                    paddingTop: 16,
                    borderTop: '1px solid #e5e7eb',
                  }}
                >
                  <button
                    onClick={handleCompletePicking}
                    disabled={!isFullyPicked || completing}
                    className={styles.btnPrimary}
                    style={{
                      padding: '10px 24px',
                      fontSize: 14,
                      backgroundColor: isFullyPicked ? '#059669' : '#9ca3af',
                    }}
                  >
                    {completing ? 'Tamamlanıyor...' : 'Toplama İşlemini Bitir & Paketlemeye Geç'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className={styles.card} style={{ textAlign: 'center', padding: 48 }}>
              Lütfen soldaki listeden toplanacak bir sipariş seçiniz.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
