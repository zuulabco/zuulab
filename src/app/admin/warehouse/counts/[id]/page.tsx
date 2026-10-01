'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import styles from '../../../admin.module.css'

interface CountLine {
  id: string
  locationId: string
  locationCode: string
  productId: string
  sku: string
  barcode: string | null
  productName: string
  expectedQuantity: number
  countedQuantity: number | null
  varianceQuantity: number | null
  status: string
  recountCount: number
  countedAt: string | null
  countedBy: string | null
  countHistory?: any[]
  notes: string | null
}

interface ReconciliationTicket {
  id: string
  ticketNumber: string
  locationCode: string
  sku: string
  productName: string
  expectedQuantity: number
  countedQuantity: number
  varianceQuantity: number
  status: string
  reason: string
  resolution: string | null
}

interface SessionData {
  id: string
  countNumber: string
  warehouseId: string
  type: string
  status: string
  blindMode: boolean
  createdBy: string
  assignedTo: string | null
  startedAt: string | null
  completedAt: string | null
  lines: CountLine[]
  tickets: ReconciliationTicket[]
}

export default function AdminWarehouseCountDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { token, user } = useAuthStore()
  const sessionId = params.id as string

  const [session, setSession] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Scan input state
  const [scanLocation, setScanLocation] = useState('')
  const [scanBarcode, setScanBarcode] = useState('')
  const [scanQuantity, setScanQuantity] = useState('1')
  const [submittingScan, setSubmittingScan] = useState(false)

  // Recount / Reconciliation action states
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchSession = async () => {
    if (!token || !sessionId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/warehouse/counts/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        setSession(data.session)
      } else {
        setError(data.error || 'Sayım detayları alınamadı.')
      }
    } catch {
      setError('Sayım servisine bağlanılamadı.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSession()
  }, [token, sessionId])

  const handleStartSession = async () => {
    if (!token || !sessionId) return
    setError(null)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/warehouse/counts/${sessionId}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })
      const data = await res.json()
      if (data.success) {
        setMessage('Sayım oturumu başlatıldı.')
        fetchSession()
      } else {
        setError(data.error || 'Sayım başlatılamadı.')
      }
    } catch {
      setError('Sayım başlatma servisine bağlanılamadı.')
    }
  }

  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !sessionId) return
    if (!scanBarcode.trim()) {
      setError('Lütfen ürün barkodu veya SKU okutunuz.')
      return
    }

    setSubmittingScan(true)
    setError(null)
    setMessage(null)

    try {
      const res = await fetch(`/api/admin/warehouse/counts/${sessionId}/scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          locationCode: scanLocation.trim() || undefined,
          barcodeOrSku: scanBarcode.trim(),
          countedQuantity: Number(scanQuantity),
        }),
      })

      const data = await res.json()
      if (data.success) {
        setMessage(`Ürün kaydedildi: Sayılan miktar ${scanQuantity}.`)
        setScanBarcode('')
        setScanQuantity('1')
        fetchSession()
      } else {
        setError(data.error || 'Sayım kaydı işlenemedi.')
      }
    } catch {
      setError('Sayım okutma servisine bağlanılamadı.')
    } finally {
      setSubmittingScan(false)
    }
  }

  const handleRequestRecount = async (lineId: string) => {
    if (!token || !sessionId) return
    setActionLoading(`recount_${lineId}`)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/warehouse/counts/${sessionId}/recount`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ lineId, notes: 'Yönetici yeniden sayım talep etti.' }),
      })
      const data = await res.json()
      if (data.success) {
        setMessage('Yeniden sayım talebi kaydedildi.')
        fetchSession()
      } else {
        setError(data.error || 'Yeniden sayım talebi oluşturulamadı.')
      }
    } catch {
      setError('Yeniden sayım servisine bağlanılamadı.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleApproveTicket = async (ticketId: string) => {
    if (!token || !sessionId) return
    setActionLoading(`approve_${ticketId}`)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/warehouse/counts/${sessionId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ticketId }),
      })
      const data = await res.json()
      if (data.success) {
        setMessage('Sayım farkı onaylandı. Uzlaştırmaya hazır.')
        fetchSession()
      } else {
        setError(data.error || 'Onay işlemi başarısız.')
      }
    } catch {
      setError('Onay servisine bağlanılamadı.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRejectTicket = async (ticketId: string) => {
    if (!token || !sessionId) return
    setActionLoading(`reject_${ticketId}`)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/warehouse/counts/${sessionId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ticketId, reason: 'Sayım farkı reddedildi.' }),
      })
      const data = await res.json()
      if (data.success) {
        setMessage('Fark bileti reddedildi.')
        fetchSession()
      } else {
        setError(data.error || 'Ret işlemi başarısız.')
      }
    } catch {
      setError('Ret servisine bağlanılamadı.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleReconcileTicket = async (ticketId: string) => {
    if (!token || !sessionId) return
    setActionLoading(`reconcile_${ticketId}`)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/warehouse/counts/${sessionId}/reconcile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ticketId }),
      })
      const data = await res.json()
      if (data.success) {
        setMessage('Uzlaştırma tamamlandı. Merkezi envanter ve lokasyon bakiyeleri güncellendi.')
        fetchSession()
      } else {
        setError(data.error || 'Uzlaştırma işlemi uygulanamadı.')
      }
    } catch {
      setError('Uzlaştırma servisine bağlanılamadı.')
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
          Sayım oturumu yükleniyor...
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className={styles.container}>
        <div className={styles.alertDanger}>Sayım oturumu bulunamadı.</div>
        <Link href="/admin/warehouse/counts" className={styles.btnSecondary}>
          ← Sayım Listesine Dön
        </Link>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 className={styles.title}>Sayım Oturumu #{session.countNumber}</h1>
            <span className={`${styles.badge} ${styles.badgePrimary}`}>{session.status}</span>
            {session.blindMode && (
              <span className={`${styles.badge} ${styles.badgeInfo}`} style={{ background: '#0891b2', color: '#fff' }}>
                Kör Denetim (Blind Audit)
              </span>
            )}
          </div>
          <p className={styles.subtitle}>
            Tür: {session.type} | Oluşturan: {session.createdBy} | Atanan: {session.assignedTo || 'Atanmadı'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/admin/warehouse/counts" className={styles.btnSecondary}>
            ← Sayımlar Listesi
          </Link>
          <Link href="/admin/warehouse/pda" className={styles.btnPrimary} style={{ background: '#0284c7' }}>
            PDA Sayım Masası
          </Link>
          {(session.status === 'DRAFT' || session.status === 'ASSIGNED') && (
            <button
              onClick={handleStartSession}
              className={styles.btnPrimary}
              style={{ background: '#16a34a' }}
            >
              Sayımı Başlat
            </button>
          )}
        </div>
      </div>

      {message && <div className={styles.alertSuccess}>{message}</div>}
      {error && <div className={styles.alertDanger}>{error}</div>}

      {/* Operator Barcode Scan Desk (When In Progress) */}
      {(session.status === 'IN_PROGRESS' || session.status === 'RECOUNT_REQUIRED') && (
        <div className={styles.card} style={{ marginBottom: 20, borderLeft: '4px solid #7c3aed' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
            Fiziksel Sayım & Barkod Okutma Masası
          </h2>
          <form onSubmit={handleScanSubmit} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 200px' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                Lokasyon Kodu (Örn: A-01-R01)
              </label>
              <input
                type="text"
                placeholder="Lokasyon kodu..."
                value={scanLocation}
                onChange={(e) => setScanLocation(e.target.value)}
                className={styles.input}
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ flex: '2 1 280px' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                Ürün Barkodu veya SKU *
              </label>
              <input
                type="text"
                placeholder="Barkod okutunuz veya SKU giriniz..."
                value={scanBarcode}
                onChange={(e) => setScanBarcode(e.target.value)}
                className={styles.input}
                style={{ width: '100%' }}
                autoFocus
              />
            </div>
            <div style={{ width: 100 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                Sayılan Adet *
              </label>
              <input
                type="number"
                min="0"
                value={scanQuantity}
                onChange={(e) => setScanQuantity(e.target.value)}
                className={styles.input}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <button
                type="submit"
                disabled={submittingScan}
                className={styles.btnPrimary}
                style={{ background: '#7c3aed', height: 42 }}
              >
                {submittingScan ? 'Kaydediliyor...' : 'Sayımı Kaydet'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Count Lines Table */}
      <div className={styles.card} style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
          Sayım Kalemleri ({session.lines?.length || 0})
        </h2>
        {(!session.lines || session.lines.length === 0) ? (
          <div style={{ color: '#64748b', padding: 20, textAlign: 'center' }}>
            Henüz sayım kalemi bulunmuyor.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Lokasyon</th>
                  <th>SKU / Ürün</th>
                  <th>Sistem Stoğu (Beklenen)</th>
                  <th>Sayılan Miktar</th>
                  <th>Fark (Variance)</th>
                  <th>Yeniden Sayım</th>
                  <th>Durum</th>
                  <th>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {session.lines.map((line) => {
                  const isMasked = line.expectedQuantity === -1
                  const hasVariance = line.varianceQuantity !== null && line.varianceQuantity !== 0

                  return (
                    <tr key={line.id}>
                      <td style={{ fontWeight: 600 }}>{line.locationCode}</td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{line.sku}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>{line.productName}</div>
                      </td>
                      <td>
                        {isMasked ? (
                          <span style={{ color: '#0891b2', fontStyle: 'italic' }}>Kör Denetim (Gizli)</span>
                        ) : (
                          <span style={{ fontWeight: 600 }}>{line.expectedQuantity}</span>
                        )}
                      </td>
                      <td>
                        {line.countedQuantity !== null ? (
                          <span style={{ fontWeight: 600 }}>{line.countedQuantity}</span>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>—</span>
                        )}
                      </td>
                      <td>
                        {line.varianceQuantity === null ? (
                          <span style={{ color: '#94a3b8' }}>—</span>
                        ) : line.varianceQuantity === 0 ? (
                          <span style={{ color: '#16a34a', fontWeight: 600 }}>0 (Fark Yok)</span>
                        ) : (
                          <span
                            style={{
                              color: line.varianceQuantity > 0 ? '#0284c7' : '#dc2626',
                              fontWeight: 700,
                            }}
                          >
                            {line.varianceQuantity > 0 ? `+${line.varianceQuantity}` : line.varianceQuantity}
                          </span>
                        )}
                      </td>
                      <td>
                        {line.recountCount > 0 ? (
                          <span className={`${styles.badge} ${styles.badgeWarning}`}>
                            #{line.recountCount} Yeniden Sayım
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>İlk Sayım</span>
                        )}
                      </td>
                      <td>
                        <span className={styles.badge}>{line.status}</span>
                      </td>
                      <td>
                        {hasVariance && line.status !== 'RECONCILED' && (
                          <button
                            onClick={() => handleRequestRecount(line.id)}
                            disabled={actionLoading === `recount_${line.id}`}
                            className={styles.btnSecondary}
                            style={{ padding: '3px 8px', fontSize: 11 }}
                          >
                            {actionLoading === `recount_${line.id}` ? '...' : 'Yeniden Sayım İste'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reconciliation Tickets (UZLAŞTIRMA BİLETLERİ) */}
      {session.tickets && session.tickets.length > 0 && (
        <div className={styles.card} style={{ borderLeft: '4px solid #ea580c' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: '#c2410c' }}>
                Uzlaştırma & Yetkili İnceleme Masası ({session.tickets.length})
              </h2>
              <p style={{ fontSize: 13, color: '#64748b' }}>
                Fark tespit edilen kalemler yetkili incelemesinden geçtikten sonra merkezi InventoryService üzerinden düzeltilir.
              </p>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Bilet No</th>
                  <th>Lokasyon</th>
                  <th>SKU</th>
                  <th>Sistem</th>
                  <th>Fiziksel Sayım</th>
                  <th>Fark</th>
                  <th>Durum</th>
                  <th>Gerekçe / Çözüm</th>
                  <th>Yetkili Karar</th>
                </tr>
              </thead>
              <tbody>
                {session.tickets.map((t) => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>{t.ticketNumber}</td>
                    <td>{t.locationCode}</td>
                    <td style={{ fontWeight: 500 }}>{t.sku}</td>
                    <td>{t.expectedQuantity}</td>
                    <td style={{ fontWeight: 600 }}>{t.countedQuantity}</td>
                    <td style={{ fontWeight: 700, color: t.varianceQuantity > 0 ? '#0284c7' : '#dc2626' }}>
                      {t.varianceQuantity > 0 ? `+${t.varianceQuantity}` : t.varianceQuantity}
                    </td>
                    <td>
                      <span className={styles.badge}>{t.status}</span>
                    </td>
                    <td style={{ fontSize: 12, maxWidth: 220, color: '#475569' }}>
                      {t.resolution || t.reason}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {t.status === 'OPEN' && (
                          <>
                            <button
                              onClick={() => handleApproveTicket(t.id)}
                              disabled={actionLoading === `approve_${t.id}`}
                              className={styles.btnPrimary}
                              style={{ background: '#16a34a', padding: '3px 8px', fontSize: 11 }}
                            >
                              Onayla
                            </button>
                            <button
                              onClick={() => handleRejectTicket(t.id)}
                              disabled={actionLoading === `reject_${t.id}`}
                              className={styles.btnSecondary}
                              style={{ padding: '3px 8px', fontSize: 11, color: '#dc2626' }}
                            >
                              Reddet
                            </button>
                          </>
                        )}
                        {t.status === 'APPROVED' && (
                          <button
                            onClick={() => handleReconcileTicket(t.id)}
                            disabled={actionLoading === `reconcile_${t.id}`}
                            className={styles.btnPrimary}
                            style={{ background: '#059669', padding: '4px 10px', fontSize: 12 }}
                          >
                            {actionLoading === `reconcile_${t.id}` ? 'İşleniyor...' : 'Stoka Uzlaştır'}
                          </button>
                        )}
                        {t.status === 'RESOLVED' && (
                          <span style={{ color: '#059669', fontWeight: 600, fontSize: 12 }}>
                            Uzlaştırıldı
                          </span>
                        )}
                      </div>
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
