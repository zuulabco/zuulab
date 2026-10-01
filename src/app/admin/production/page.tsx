'use client'

import React, { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import Modal from '@/components/common/Modal'
import { getProductionStatusConfig, getMaterialReadinessStatusConfig } from '@/lib/constants/admin-status'
import styles from '../admin.module.css'

export default function ProductionPage() {
  const { token } = useAuthStore()
  const { addToast } = useToastStore()

  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Complete Batch Modal State
  const [completingOrder, setCompletingOrder] = useState<any | null>(null)
  const [completedQty, setCompletedQty] = useState<number | ''>('')
  const [failedQty, setFailedQty] = useState<number | ''>(0)
  const [submittingComplete, setSubmittingComplete] = useState(false)

  async function loadOrders() {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/production', { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (data.success) {
        setOrders(data.orders || [])
      } else {
        addToast(data.error || 'Üretim emirleri yüklenemedi.', 'error')
      }
    } catch (err: any) {
      addToast(err.message || 'Üretim servisine bağlanılamadı.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadOrders()
  }, [token])

  async function handleAction(orderId: string, action: 'start' | 'stock', body?: any) {
    setActionLoading(orderId + action)
    try {
      const res = await fetch(`/api/admin/production/${orderId}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await res.json()
      if (!data.success) {
        addToast(data.error || 'İşlem başarısız oldu.', 'error')
      } else {
        addToast(
          action === 'start' ? 'Baskı emri başlatıldı.' : 'Ürünler merkezi stoğa başarıyla eklendi.',
          'success'
        )
        await loadOrders()
      }
    } catch (err: any) {
      addToast(err.message || 'İşlem sırasında hata oluştu.', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleConfirmComplete(e: React.FormEvent) {
    e.preventDefault()
    if (!completingOrder || completedQty === '') return
    setSubmittingComplete(true)
    try {
      const res = await fetch(`/api/admin/production/${completingOrder.id}/complete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completedQuantity: Number(completedQty),
          failedQuantity: Number(failedQty || 0),
        }),
      })
      const data = await res.json()
      if (data.success) {
        addToast('Baskı tamamlandı olarak işaretlendi ve stoğa devir bekliyor.', 'success')
        setCompletingOrder(null)
        await loadOrders()
      } else {
        addToast(data.error || 'Tamamlama işlemi başarısız.', 'error')
      }
    } catch (err: any) {
      addToast(err.message || 'İşlem sırasında hata oluştu.', 'error')
    } finally {
      setSubmittingComplete(false)
    }
  }

  const active = orders.filter((o) => o.status === 'IN_PROGRESS')
  const queued = orders.filter((o) => o.status === 'PLANNED' || o.status === 'QUEUED')
  const completed = orders.filter((o) => o.status === 'COMPLETED')
  const history = orders.filter((o) => ['STOCKED', 'FAILED', 'CANCELLED'].includes(o.status))

  // Metrics
  const metrics = useMemo(() => {
    const total = orders.length
    const inProgressCount = active.length
    const queuedCount = queued.length
    const readyToStockCount = completed.length
    const blockedCount = orders.filter((o) => o.materialReadiness?.status === 'BLOCKED').length
    return { total, inProgressCount, queuedCount, readyToStockCount, blockedCount }
  }, [orders, active, queued, completed])

  return (
    <div className={styles.pageContainer}>
      {/* Page Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>3D Üretim Masası (Print Operations)</h1>
          <p className={styles.subtitle}>
            Atölye 3D yazıcı üretim kuyruğu, hammadde hazırlığı ve merkezi stoğa devir.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={() => loadOrders()}
            disabled={loading}
          >
            Yenile
          </button>
          <Link
            href="/admin/production/new"
            className={`${styles.btn} ${styles.btnPrimary}`}
            style={{ textDecoration: 'none' }}
          >
            + Yeni Üretim Emri
          </Link>
        </div>
      </div>

      {/* Metrics Strip */}
      <div className={styles.metricsStrip}>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Toplam Üretim Emri</div>
          <div className={styles.metricValue}>{metrics.total}</div>
          <div className={styles.metricSub}>Atölye iş kayıtları</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Yazıcıda (Aktif)</div>
          <div className={styles.metricValue} style={{ color: 'var(--zuu-blue, #0284c7)' }}>
            {metrics.inProgressCount}
          </div>
          <div className={styles.metricSub}>Baskısı devam eden partiler</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Sırada Bekleyen</div>
          <div className={styles.metricValue}>{metrics.queuedCount}</div>
          <div className={styles.metricSub}>Planlanan ve kuyruktaki partiler</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Stoğa Devir Bekleyen</div>
          <div className={styles.metricValue} style={{ color: 'var(--success)' }}>
            {metrics.readyToStockCount}
          </div>
          <div className={styles.metricSub}>Baskısı bitmiş, rafa alınacaklar</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Malzeme Bloke</div>
          <div className={styles.metricValue} style={{ color: metrics.blockedCount > 0 ? 'var(--danger)' : 'inherit' }}>
            {metrics.blockedCount}
          </div>
          <div className={styles.metricSub}>{metrics.blockedCount > 0 ? 'Hammadde yetersiz' : 'Tüm malzemeler hazır'}</div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Üretim emirleri yükleniyor...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* ── 1. ACTIVE IN-PROGRESS PRODUCTION ───────────────────────────────────── */}
          <div className={styles.cardPanel}>
            <div className={styles.panelHeader}>
              <span className={styles.panelTitle}>Yazıcıda Aktif Devam Eden Baskılar ({active.length})</span>
            </div>
            <div className={styles.panelBody} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {active.length === 0 ? (
                <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  Şu anda 3D yazıcılarda aktif basılan bir parti bulunmuyor.
                </div>
              ) : (
                active.map((o) => (
                  <div
                    key={o.id}
                    style={{
                      background: 'var(--surface-1)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: 16,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                          {o.productNameSnapshot}
                        </span>
                        {o.materialReadiness && (
                          <span className={`${styles.badge} ${getMaterialReadinessStatusConfig(o.materialReadiness.status).badgeClass}`}>
                            {o.materialReadiness.badgeLabel || 'Malzeme Hazır'}
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                        SKU: <span style={{ fontFamily: 'var(--font-mono)' }}>{o.skuSnapshot}</span> · Miktar: <strong style={{ color: 'var(--text-primary)' }}>{o.quantity} adet</strong>
                        {o.printerReference && ` · Yazıcı: ${o.printerReference}`}
                        {o.startedAt && ` · Başlama: ${new Date(o.startedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                           <button
                        type="button"
                        className={`${styles.btn} ${styles.btnPrimary}`}
                        style={{ padding: '6px 12px', fontSize: 12, background: '#10b981', borderColor: '#10b981' }}
                        onClick={() => {
                          setCompletingOrder(o)
                          setCompletedQty(o.quantity)
                          setFailedQty(0)
                        }}
                      >
                        Baskıyı Tamamla
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ── 2. COMPLETED & READY TO STOCK ───────────────────────────────────────── */}
          <div className={styles.cardPanel}>
            <div className={styles.panelHeader}>
              <span className={styles.panelTitle}>Tamamlanan ve Merkezi Stoğa Alınacaklar ({completed.length})</span>
            </div>
            <div className={styles.panelBody} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {completed.length === 0 ? (
                <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  Stoğa aktarılmayı bekleyen tamamlanmış üretim bulunmuyor.
                </div>
              ) : (
                completed.map((o) => (
                  <div
                    key={o.id}
                    style={{
                      background: 'var(--surface-0)',
                      border: '1px solid #bbf7d0',
                      borderRadius: 6,
                      padding: 16,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {o.productNameSnapshot}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                        Kabul Edilen: <strong style={{ color: '#16a34a' }}>{o.acceptedQuantity} adet</strong>
                        {o.failedQuantity > 0 && ` · Fire/Hatalı: ${o.failedQuantity} adet`}
                        <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>(SKU: {o.skuSnapshot})</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={actionLoading === o.id + 'stock'}
                      className={`${styles.btn} ${styles.btnPrimary}`}
                      style={{ padding: '6px 14px', fontSize: 12 }}
                      onClick={() => handleAction(o.id, 'stock')}
                    >
                      {actionLoading === o.id + 'stock' ? 'Stoğa Alınıyor...' : `+ ${o.acceptedQuantity} Adeti Merkezi Stoğa Ekle`}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ── 3. QUEUED & PLANNED PRODUCTION ──────────────────────────────────────── */}
          <div className={styles.cardPanel}>
            <div className={styles.panelHeader}>
              <span className={styles.panelTitle}>Sırada Bekleyen Baskı Emirleri ({queued.length})</span>
            </div>
            <div className={styles.panelBody} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {queued.length === 0 ? (
                <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  Kuyrukta bekleyen üretim emri bulunmuyor.
                </div>
              ) : (
                queued.map((o) => {
                  const isBlocked = o.materialReadiness?.status === 'BLOCKED'
                  return (
                    <div
                      key={o.id}
                      style={{
                        background: 'var(--surface-1)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        padding: 14,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 12,
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {o.productNameSnapshot}
                          </span>
                          {o.materialReadiness && (
                            <span className={`${styles.badge} ${getMaterialReadinessStatusConfig(o.materialReadiness.status).badgeClass}`}>
                              {o.materialReadiness.badgeLabel || (isBlocked ? 'Hammadde Eksik' : 'Malzeme Hazır')}
                            </span>
                          )}
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            Öncelik: {o.priority}
                          </span>
                        </div>

                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                          Miktar: <strong>{o.quantity} adet</strong> · SKU: <span style={{ fontFamily: 'var(--font-mono)' }}>{o.skuSnapshot}</span>
                          {o.notes && <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>— {o.notes}</span>}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {isBlocked ? (
                          <Link
                            href="/admin/materials"
                            className={`${styles.btn} ${styles.btnSecondary}`}
                            style={{ padding: '5px 10px', fontSize: 11, color: 'var(--danger)', borderColor: 'var(--danger)' }}
                          >
                            Hammaddeyi İncele &rarr;
                          </Link>
                        ) : (
                          <button
                            type="button"
                            disabled={actionLoading === o.id + 'start'}
                            className={`${styles.btn} ${styles.btnPrimary}`}
                            style={{ padding: '5px 12px', fontSize: 11 }}
                            onClick={() => handleAction(o.id, 'start')}
                          >
                            {actionLoading === o.id + 'start' ? 'Başlatılıyor...' : 'Baskıyı Başlat'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* ── 4. PRODUCTION HISTORY / ARCHIVE ─────────────────────────────────────── */}
          {history.length > 0 && (
            <div className={styles.cardPanel}>
              <div className={styles.panelHeader}>
                <span className={styles.panelTitle}>Son Tamamlanan & Geçmiş Üretim Kayıtları ({history.length})</span>
              </div>
              <div className={styles.panelBody} style={{ padding: 0 }}>
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Ürün</th>
                        <th>SKU</th>
                        <th style={{ textAlign: 'right' }}>Planlanan</th>
                        <th style={{ textAlign: 'right' }}>Kabul Edilen</th>
                        <th>Durum</th>
                        <th>Tarih</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.slice(0, 10).map((h) => (
                        <tr key={h.id}>
                          <td style={{ fontWeight: 600 }}>{h.productNameSnapshot}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{h.skuSnapshot}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{h.quantity}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#16a34a' }}>
                            {h.acceptedQuantity ?? h.quantity}
                          </td>
                          <td>
                            <span className={`${styles.badge} ${getProductionStatusConfig(h.status).badgeClass}`}>
                              {getProductionStatusConfig(h.status).label}
                            </span>
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            {new Date(h.updatedAt).toLocaleDateString('tr-TR')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Complete Batch Confirmation Modal */}
      {completingOrder && (
        <Modal
          isOpen={!!completingOrder}
          onClose={() => setCompletingOrder(null)}
          ariaLabel="Baskıyı Tamamla"
        >
          <form onSubmit={handleConfirmComplete} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
              Baskı Partisini Tamamla
            </h3>

            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
              <strong>{completingOrder.productNameSnapshot}</strong> için baskı sürecini tamamlıyorsunuz.
              Kabul edilen sağlam ürünleri ve fire miktarını belirleyin.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Sağlam Üretilen (Kabul) *
                </label>
                <input
                  type="number"
                  min={0}
                  max={completingOrder.quantity * 2}
                  value={completedQty}
                  onChange={(e) => setCompletedQty(e.target.value === '' ? '' : Number(e.target.value))}
                  className={styles.searchBox}
                  style={{ width: '100%', fontSize: 13, fontFamily: 'var(--font-mono)' }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Hatalı / Fire Adedi
                </label>
                <input
                  type="number"
                  min={0}
                  value={failedQty}
                  onChange={(e) => setFailedQty(e.target.value === '' ? '' : Number(e.target.value))}
                  className={styles.searchBox}
                  style={{ width: '100%', fontSize: 13, fontFamily: 'var(--font-mono)' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={() => setCompletingOrder(null)}
                disabled={submittingComplete}
              >
                Vazgeç
              </button>
              <button
                type="submit"
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={submittingComplete || completedQty === ''}
              >
                {submittingComplete ? 'Kaydediliyor...' : 'Tamamlandı Olarak İşle'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}