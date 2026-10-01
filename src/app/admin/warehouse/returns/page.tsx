'use client'

import React, { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import styles from '../../admin.module.css'

interface ReturnInspection {
  id: string
  returnNumber: string
  inspectedBy: string
  status: string
  totalExpectedItems: number
  totalInspectedItems: number
}

interface ReturnInspectionItem {
  id: string
  sku: string
  scannedBarcode: string | null
  condition: string
  disposition: string
  quantity: number
  restocked: boolean
  exceptionId: string | null
}

export default function AdminWarehouseReturnsPage() {
  const { token, user } = useAuthStore()

  const [packageBarcodeInput, setPackageBarcodeInput] = useState('')
  const [productBarcodeInput, setProductBarcodeInput] = useState('')
  const [activeInspection, setActiveInspection] = useState<ReturnInspection | null>(null)
  const [inspectedItems, setInspectedItems] = useState<ReturnInspectionItem[]>([])
  const [condition, setCondition] = useState('USED')
  const [disposition, setDisposition] = useState('RESTOCK')
  const [quantity, setQuantity] = useState('1')
  const [notes, setNotes] = useState('')

  const [scanningPackage, setScanningPackage] = useState(false)
  const [inspectingItem, setInspectingItem] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const packageInputRef = useRef<HTMLInputElement>(null)
  const productInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    packageInputRef.current?.focus()
  }, [])

  const handleScanPackage = async (e: React.FormEvent) => {
    e.preventDefault()
    const barcode = packageBarcodeInput.trim()
    if (!barcode || !token) return

    setScanningPackage(true)
    setError(null)
    setMessage(null)

    try {
      const res = await fetch('/api/admin/warehouse/returns', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ barcode }),
      })

      const data = await res.json()
      if (data.success) {
        setActiveInspection(data.inspection)
        setMessage(`İade paketi doğrulandı (#${data.inspection.returnNumber}). Ürünleri tarayabilirsiniz.`)
        setTimeout(() => productInputRef.current?.focus(), 100)
      } else {
        setError(data.error || 'İade paketi okutulamadı.')
      }
    } catch {
      setError('İade servisine ulaşılamadı.')
    } finally {
      setScanningPackage(false)
    }
  }

  const handleInspectItem = async (e: React.FormEvent) => {
    e.preventDefault()
    const barcode = productBarcodeInput.trim()
    if (!barcode || !activeInspection || !token) return

    setInspectingItem(true)
    setError(null)
    setMessage(null)

    try {
      const res = await fetch(`/api/admin/warehouse/returns/${activeInspection.id}/inspect`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scannedBarcode: barcode,
          condition,
          disposition,
          quantity: parseInt(quantity, 10) || 1,
          notes,
        }),
      })

      const data = await res.json()
      if (data.success) {
        setInspectedItems((prev) => [data.inspectionItem, ...prev])
        if (data.inspectionItem.restocked) {
          setMessage(`Ürün (#${data.inspectionItem.sku}) incelendi ve tekrar satış stoğuna (RESTOCK) eklendi.`)
        } else {
          setMessage(`Ürün (#${data.inspectionItem.sku}) hasarlı/karantina olarak kaydedildi. Satışa sunulmadı.`)
        }
        setProductBarcodeInput('')
        setNotes('')
        setTimeout(() => productInputRef.current?.focus(), 100)
      } else {
        setError(data.error || 'Ürün kontrolü başarısız.')
      }
    } catch {
      setError('İnceleme servisine ulaşılamadı.')
    } finally {
      setInspectingItem(false)
    }
  }

  const handleCompleteInspection = async () => {
    if (!activeInspection || !token) return
    setCompleting(true)
    setError(null)
    setMessage(null)

    try {
      const res = await fetch(`/api/admin/warehouse/returns/${activeInspection.id}/complete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        setMessage(`İade kabul işlemi tamamlandı (#${activeInspection.returnNumber}).`)
        setActiveInspection(null)
        setInspectedItems([])
        setPackageBarcodeInput('')
        setTimeout(() => packageInputRef.current?.focus(), 100)
      } else {
        setError(data.error || 'İşlem tamamlanamadı.')
      }
    } catch {
      setError('İnceleme tamamlanırken hata oluştu.')
    } finally {
      setCompleting(false)
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Link href="/admin/warehouse" style={{ color: 'var(--text-muted)', fontSize: 13, textDecoration: 'none' }}>
              ← Depo Hub
            </Link>
          </div>
          <h1 className={styles.title}>Fiziksel İade Kabul & Kontrol Masası (Returns Hub)</h1>
          <p className={styles.subtitle}>
            Gelen iade kargolarının barkodla tespiti, ürün kontrolü, restock veya karantina sevk işlemi
          </p>
        </div>
      </div>

      {message && <div className={styles.alertSuccess}>{message}</div>}
      {error && <div className={styles.alertDanger}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Step 1: Scan Return Package */}
        <div className={styles.card}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
            1. İade Kargo / RMA Barkodu Okut
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
            Kargo takip barkodunu, sipariş numarasını veya RMA numarasını klavye barkod okuyucu ile okutun.
          </p>

          <form onSubmit={handleScanPackage} style={{ display: 'flex', gap: 10 }}>
            <input
              ref={packageInputRef}
              type="text"
              value={packageBarcodeInput}
              onChange={(e) => setPackageBarcodeInput(e.target.value)}
              placeholder="RMA-001, Takip No veya Sipariş No..."
              className={styles.input}
              disabled={scanningPackage}
            />
            <button type="submit" className={styles.btnPrimary} disabled={scanningPackage}>
              {scanningPackage ? 'Kontrol...' : 'Paketi Aç'}
            </button>
          </form>

          {activeInspection && (
            <div style={{ marginTop: 20, padding: 14, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>İade / RMA No:</span>
                <strong style={{ fontFamily: 'monospace' }}>{activeInspection.returnNumber}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Kontrol Eden:</span>
                <span>{activeInspection.inspectedBy}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>İncelenen / Beklenen:</span>
                <span className={styles.tag}>{inspectedItems.length} Kalem Kontrol Edildi</span>
              </div>
            </div>
          )}
        </div>

        {/* Step 2: Item Inspection */}
        <div className={styles.card}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
            2. Fiziksel Ürün Kontrolü & Restock
          </h2>

          {!activeInspection ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', background: '#f8fafc', borderRadius: 8 }}>
              Lütfen önce sol taraftan iade paketini okutarak açın.
            </div>
          ) : (
            <form onSubmit={handleInspectItem}>
              <div style={{ marginBottom: 12 }}>
                <label className={styles.label}>Ürün Barkodu (SKU / EAN)</label>
                <input
                  ref={productInputRef}
                  type="text"
                  value={productBarcodeInput}
                  onChange={(e) => setProductBarcodeInput(e.target.value)}
                  placeholder="Ürün üzerindeki barkodu okutun..."
                  className={styles.input}
                  disabled={inspectingItem}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label className={styles.label}>Fiziksel Durum</label>
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value)}
                    className={styles.select}
                  >
                    <option value="UNOPENED">Açılmamış / Sıfır</option>
                    <option value="OPEN_BOX">Kutusu Açılmış</option>
                    <option value="USED">Kullanılmış</option>
                    <option value="DAMAGED">Kırık / Hasarlı</option>
                    <option value="DEFECTIVE">Arızalı / Kusurlu</option>
                  </select>
                </div>

                <div>
                  <label className={styles.label}>Aksiyon (Disposition)</label>
                  <select
                    value={disposition}
                    onChange={(e) => setDisposition(e.target.value)}
                    className={styles.select}
                  >
                    <option value="RESTOCK">Tekrar Satışa Al (Restock)</option>
                    <option value="QUARANTINE">Karantinaya Sevk Et</option>
                    <option value="SCRAP">Hurda / İmha</option>
                    <option value="REVIEW">Teknik İnceleme</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label className={styles.label}>Miktar</label>
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className={styles.input}
                  />
                </div>
                <div>
                  <label className={styles.label}>Kontrol Notu</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Opsiyonel açıklama..."
                    className={styles.input}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  type="submit"
                  className={styles.btnPrimary}
                  disabled={inspectingItem}
                >
                  {inspectingItem ? 'İşleniyor...' : 'Ürünü Kontrol Et & Kaydet'}
                </button>

                <button
                  type="button"
                  onClick={handleCompleteInspection}
                  className={styles.btnSecondary}
                  style={{ background: '#059669', color: '#fff', border: 'none' }}
                  disabled={completing}
                >
                  {completing ? 'Tamamlanıyor...' : 'İadeyi Bitir'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Inspected items log */}
      {inspectedItems.length > 0 && (
        <div className={styles.card} style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Bu Oturumda İncelenen Kalemler</h3>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Ürün SKU</th>
                  <th>Barkod</th>
                  <th>Durum</th>
                  <th>Karar</th>
                  <th>Miktar</th>
                  <th>Envanter Durumu</th>
                </tr>
              </thead>
              <tbody>
                {inspectedItems.map((item, idx) => (
                  <tr key={item.id || idx}>
                    <td>
                      <strong style={{ fontFamily: 'monospace' }}>{item.sku}</strong>
                    </td>
                    <td>{item.scannedBarcode || '—'}</td>
                    <td>{item.condition}</td>
                    <td>
                      <span className={item.disposition === 'RESTOCK' ? styles.badgeSuccess : styles.badgeDanger}>
                        {item.disposition}
                      </span>
                    </td>
                    <td>{item.quantity} adet</td>
                    <td>
                      {item.restocked ? (
                        <span style={{ color: '#059669', fontWeight: 600 }}>Satılabilir Stoğa Eklendi</span>
                      ) : (
                        <span style={{ color: '#dc2626', fontWeight: 600 }}>Karantinada (Satılamaz)</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
