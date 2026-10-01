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
  shipmentId: string | null
  items?: Array<{
    id: string
    productId: string
    sku: string
    barcode: string | null
    productNameSnapshot: string
    orderedQuantity: number
    pickedQuantity: number
    packedQuantity: number
    status: string
  }>
}

export default function WarehousePackingPage() {
  const router = useRouter()
  const { token, canFetch } = useAuthStore()

  const [orderQuery, setOrderQuery] = useState('')
  const [activeFulfillment, setActiveFulfillment] = useState<FulfillmentItem | null>(null)
  const [barcodeInput, setBarcodeInput] = useState('')
  const [packageCount, setPackageCount] = useState(1)
  const [weightGrams, setWeightGrams] = useState(1000)
  const [scanning, setScanning] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [shipmentResult, setShipmentResult] = useState<any>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const barcodeInputRef = useRef<HTMLInputElement>(null)
  const orderInputRef = useRef<HTMLInputElement>(null)

  const focusScanner = () => {
    setTimeout(() => {
      barcodeInputRef.current?.focus()
    }, 50)
  }

  const handleLookupOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    const q = orderQuery.trim()
    if (!q || !canFetch) return
    setError(null)
    setMessage(null)
    setShipmentResult(null)

    try {
      const res = await fetch(`/api/admin/warehouse?orderNumber=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success && data.fulfillments && data.fulfillments.length > 0) {
        const found = data.fulfillments[0]
        setActiveFulfillment(found)

        // Automatically start packing session if PICKED
        if (found.status === 'PICKED') {
          await fetch(`/api/admin/warehouse/fulfillments/${found.id}/start-packing`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ packageCount: 1 }),
          })
          found.status = 'PACKING'
        }

        setMessage(`Sipariş #${q} başarıyla yüklendi. Paketleme modundasınız.`)
        focusScanner()
      } else {
        setError(`Sipariş bulunamadı: ${q}`)
      }
    } catch {
      setError('Sipariş arama servisine ulaşılamadı.')
    }
  }

  const handlePackScan = async (e: React.FormEvent) => {
    e.preventDefault()
    const barcode = barcodeInput.trim()
    if (!barcode || !activeFulfillment || !canFetch) return

    setScanning(true)
    setError(null)
    setMessage(null)

    try {
      const clientRequestId = `req_pack_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      const res = await fetch(`/api/admin/warehouse/fulfillments/${activeFulfillment.id}/pack`, {
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
        setMessage(
          `Koliye eklendi: ${data.productName} (${data.sku}) [Paketlenen: ${data.packedQuantity} / ${data.orderedQuantity}]`
        )

        // Update local item quantity immediately
        setActiveFulfillment((prev) => {
          if (!prev) return null
          const nextItems = (prev.items || []).map((it) => {
            if (it.sku.toUpperCase() === data.sku.toUpperCase()) {
              return { ...it, packedQuantity: data.packedQuantity }
            }
            return it
          })
          return { ...prev, items: nextItems }
        })
      } else {
        setError(data.error || 'Paketleme okutma başarısız.')
      }
    } catch {
      setError('Okutma servisine ulaşılamadı.')
    } finally {
      setBarcodeInput('')
      setScanning(false)
      focusScanner()
    }
  }

  const handleCompletePacking = async () => {
    if (!activeFulfillment || !canFetch) return
    setCompleting(true)
    setMessage(null)
    setError(null)

    try {
      const res = await fetch(
        `/api/admin/warehouse/fulfillments/${activeFulfillment.id}/complete-packing`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            packageCount,
            weightGrams,
          }),
        }
      )

      const data = await res.json()
      if (data.success) {
        setShipmentResult(data)
        setMessage(
          `Paketleme tamamlandı! Kargo gönderisi ve etiketi hazırlandı. Takip No: ${data.shipment?.trackingNumber || '-'}`
        )
      } else {
        setError(data.error || 'Paketleme tamamlanamadı.')
      }
    } catch {
      setError('Paketleme servisine ulaşılamadı.')
    } finally {
      setCompleting(false)
    }
  }

  const items = activeFulfillment?.items || []
  const totalOrdered = items.reduce((acc, it) => acc + it.orderedQuantity, 0)
  const totalPacked = items.reduce((acc, it) => acc + it.packedQuantity, 0)
  const isFullyPacked = items.length > 0 && items.every((it) => it.packedQuantity === it.orderedQuantity)

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Paketleme Masası (Warehouse Packing Station)</h1>
          <p className={styles.subtitle}>
            Sipariş ürünlerini koliye yerleştirin, barkodlarını doğrulayın ve kargo etiketini basın
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/admin/warehouse" className={styles.btnSecondary}>
            ← Depo Paneline Dön
          </Link>
          <Link href="/admin/warehouse/manifests" className={styles.btnPrimary}>
            Zimmet / Manifestolar →
          </Link>
        </div>
      </div>

      {message && <div className={styles.alertSuccess}>{message}</div>}
      {error && <div className={styles.alertDanger}>{error}</div>}

      {/* Top Search Bar */}
      <div className={styles.card} style={{ marginBottom: 20 }}>
        <form onSubmit={handleLookupOrder} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <label style={{ fontWeight: 600, fontSize: 13, minWidth: 140 }}>
            Sipariş No / Barkod:
          </label>
          <input
            ref={orderInputRef}
            type="text"
            placeholder="Örn: ZUU-2026-001 veya TY sipariş no..."
            value={orderQuery}
            onChange={(e) => setOrderQuery(e.target.value)}
            className={styles.input}
            style={{ flex: 1, maxWidth: 400 }}
          />
          <button type="submit" className={styles.btnPrimary}>
            Siparişi Getir
          </button>
        </form>
      </div>

      {activeFulfillment && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
          {/* Left: Items & Packing Scan */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Scanner Input */}
            <div
              className={styles.card}
              style={{
                border: '2px solid #10b981',
                backgroundColor: '#f0fdf4',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontWeight: 600, fontSize: 14, color: '#065f46' }}>
                  KOLİYE KOYMA & BARKOD DOĞRULAMA
                </span>
                <span style={{ fontSize: 12, color: '#047857' }}>
                  Sipariş: #{activeFulfillment.orderNumber || activeFulfillment.marketplaceOrderNumber}
                </span>
              </div>

              <form onSubmit={handlePackScan} style={{ display: 'flex', gap: 10 }}>
                <input
                  ref={barcodeInputRef}
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  placeholder="Koliye konulan ürün barkodunu okutunuz [ENTER]..."
                  disabled={scanning || isFullyPacked}
                  style={{
                    flex: 1,
                    padding: '14px 16px',
                    fontSize: 18,
                    fontWeight: 600,
                    borderRadius: 8,
                    border: '2px solid #a7f3d0',
                    outline: 'none',
                    backgroundColor: '#ffffff',
                  }}
                />
                <button
                  type="submit"
                  disabled={scanning || !barcodeInput.trim() || isFullyPacked}
                  className={styles.btnPrimary}
                  style={{ padding: '0 24px', fontSize: 15, backgroundColor: '#059669' }}
                >
                  {scanning ? 'İşleniyor...' : 'Koliye Ekle'}
                </button>
              </form>

              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span>
                  Paketlenen: <strong>{totalPacked}</strong> / {totalOrdered} Adet
                </span>
                <span>
                  Tamamlanma:{' '}
                  <strong>{totalOrdered > 0 ? Math.round((totalPacked / totalOrdered) * 100) : 0}%</strong>
                </span>
              </div>
            </div>

            {/* Items Table */}
            <div className={styles.card}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
                Sipariş İçi Ürünler
              </h3>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Ürün Adı</th>
                    <th>SKU</th>
                    <th>Toplanan</th>
                    <th>Paketlenen</th>
                    <th>Kalan</th>
                    <th>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const isDone = it.packedQuantity === it.orderedQuantity
                    return (
                      <tr key={it.id} style={{ backgroundColor: isDone ? '#f0fdf4' : 'inherit' }}>
                        <td>
                          <strong>{it.productNameSnapshot}</strong>
                        </td>
                        <td>
                          <code>{it.sku}</code>
                        </td>
                        <td>{it.pickedQuantity}</td>
                        <td style={{ fontWeight: 600, color: isDone ? '#15803d' : '#2563eb' }}>
                          {it.packedQuantity}
                        </td>
                        <td style={{ color: it.orderedQuantity - it.packedQuantity > 0 ? '#b91c1c' : '#15803d' }}>
                          {it.orderedQuantity - it.packedQuantity}
                        </td>
                        <td>
                          {isDone ? (
                            <span className={`${styles.badge} ${styles.badgeSuccess}`}>
                              Kutuda
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
            </div>
          </div>

          {/* Right: Package Info & Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className={styles.card}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
                Paket & Koli Bilgileri
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#4b5563', marginBottom: 4 }}>
                    Koli Sayısı
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={packageCount}
                    onChange={(e) => setPackageCount(Number(e.target.value))}
                    className={styles.input}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#4b5563', marginBottom: 4 }}>
                    Tahmini Ağırlık (Gram)
                  </label>
                  <input
                    type="number"
                    min={100}
                    step={100}
                    value={weightGrams}
                    onChange={(e) => setWeightGrams(Number(e.target.value))}
                    className={styles.input}
                  />
                </div>

                <div style={{ marginTop: 8 }}>
                  <button
                    onClick={handleCompletePacking}
                    disabled={!isFullyPacked || completing}
                    className={styles.btnPrimary}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: 14,
                      backgroundColor: isFullyPacked ? '#059669' : '#9ca3af',
                    }}
                  >
                    {completing ? 'Etiket Üretiliyor...' : 'Paketi Tamamla & Etiket Bas'}
                  </button>
                </div>
              </div>
            </div>

            {/* Shipment Result & Label Action */}
            {shipmentResult && (
              <div
                className={styles.card}
                style={{ border: '2px solid #059669', backgroundColor: '#f0fdf4' }}
              >
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#065f46', marginBottom: 8 }}>
                  Kargo ve Etiket Hazır
                </h3>
                <div style={{ fontSize: 13, marginBottom: 8 }}>
                  Taşıyıcı: <strong>{shipmentResult.shipment?.carrier || 'Sürat Kargo'}</strong>
                </div>
                <div style={{ fontSize: 13, marginBottom: 12 }}>
                  Takip No: <strong>{shipmentResult.shipment?.trackingNumber || '-'}</strong>
                </div>

                {shipmentResult.label && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <a
                      href={`/api/admin/shipping/labels/${shipmentResult.label.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.btnPrimary}
                      style={{ textAlign: 'center' }}
                    >
                      Kargo Etiketini Yazdır (100×100 PDF)
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
