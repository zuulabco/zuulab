'use client'

import React, { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import { formatPrice } from '@/lib/utils'
import { getReturnStatusConfig } from '@/lib/constants/admin-status'
import styles from '../admin.module.css'

interface ReturnItem {
  id: string
  returnNumber: string
  orderNumber: string
  type: string
  status: string
  reason: string
  refundAmount?: number
  customerNote?: string | null
  adminNote?: string | null
  requestedAt: string
  completedAt?: string | null
  user: {
    fullName: string
    email: string
  }
  items: Array<{
    quantity: number
    productName?: string
  }>
  shipment?: {
    provider: string
    trackingNumber: string
    status: string
  } | null
}

export default function AdminReturnsPage() {
  const { token, canFetch } = useAuthStore()
  const { addToast } = useToastStore()

  const [returns, setReturns] = useState<ReturnItem[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  const fetchReturns = async () => {
    if (!canFetch) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      if (searchQuery.trim()) params.set('search', searchQuery.trim())

      const res = await fetch(`/api/admin/returns?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        setReturns(data.returns || [])
      } else {
        addToast(data.error || 'İade listesi yüklenemedi.', 'error')
      }
    } catch {
      addToast('İade verileri alınırken bağlantı hatası oluştu.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchReturns()
  }, [token, canFetch, statusFilter])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    fetchReturns()
  }

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = returns.length
    const requested = returns.filter((r) => r.status === 'REQUESTED' || r.status === 'UNDER_REVIEW').length
    const inTransit = returns.filter((r) => r.status === 'RETURN_SHIPPING_CREATED' || r.status === 'IN_TRANSIT').length
    const received = returns.filter((r) => r.status === 'RECEIVED' || r.status === 'INSPECTED').length
    const completed = returns.filter((r) => r.status === 'COMPLETED').length
    return { total, requested, inTransit, received, completed }
  }, [returns])

  return (
    <div className={styles.container}>
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>İadeler & Müşteri Talepleri</h1>
          <p className={styles.subtitle}>
            Müşteri iade başvuruları, tersine lojistik kargo takipleri, depo ekspertizleri ve geri ödemeler.
          </p>
        </div>

        <Link href="/admin/orders" className={`${styles.btn} ${styles.btnSecondary}`}>
          Siparişleri İncele &rarr;
        </Link>
      </div>

      {/* ── METRIC STATS CARDS ──────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div
          onClick={() => setStatusFilter('ALL')}
          className={`${styles.selectableCard} ${statusFilter === 'ALL' ? styles.selectableCardActive : ''}`}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Toplam Talep
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {metrics.total}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Tüm iade/değişim kayıtları
          </div>
        </div>

        <div
          onClick={() => setStatusFilter('REQUESTED')}
          className={`${styles.selectableCard} ${statusFilter === 'REQUESTED' ? styles.selectableCardActive : ''}`}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            İnceleme Bekleyen
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#d97706', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {metrics.requested}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Onay bekleyen yeni talepler
          </div>
        </div>

        <div
          onClick={() => setStatusFilter('IN_TRANSIT')}
          className={`${styles.selectableCard} ${statusFilter === 'IN_TRANSIT' ? styles.selectableCardActive : ''}`}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Kargodaki İadeler
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--brand-blue, #0080c4)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {metrics.inTransit}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Depoya ulaşmakta olanlar
          </div>
        </div>

        <div
          onClick={() => setStatusFilter('RECEIVED')}
          className={`${styles.selectableCard} ${statusFilter === 'RECEIVED' ? styles.selectableCardActive : ''}`}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Depoda Ekspertiz
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#7c3aed', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {metrics.received}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            İncelenmeyi bekleyen ürünler
          </div>
        </div>

        <div
          onClick={() => setStatusFilter('COMPLETED')}
          className={`${styles.selectableCard} ${statusFilter === 'COMPLETED' ? styles.selectableCardActive : ''}`}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Tamamlanan
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#16a34a', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {metrics.completed}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Geri ödemesi yapılmış iadeler
          </div>
        </div>
      </div>

      {/* ── OPERATIONAL TABS ─────────────────────────────────────────────────── */}
      <div className={styles.operationalTabs}>
        <button
          type="button"
          onClick={() => setStatusFilter('ALL')}
          className={`${styles.operationalTabItem} ${statusFilter === 'ALL' ? styles.active : ''}`}
        >
          Tüm Talepler ({metrics.total})
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter('REQUESTED')}
          className={`${styles.operationalTabItem} ${statusFilter === 'REQUESTED' ? styles.active : ''}`}
        >
          Yeni Talepler ({metrics.requested})
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter('APPROVED')}
          className={`${styles.operationalTabItem} ${statusFilter === 'APPROVED' ? styles.active : ''}`}
        >
          Onaylananlar
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter('IN_TRANSIT')}
          className={`${styles.operationalTabItem} ${statusFilter === 'IN_TRANSIT' ? styles.active : ''}`}
        >
          İade Kargoda ({metrics.inTransit})
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter('RECEIVED')}
          className={`${styles.operationalTabItem} ${statusFilter === 'RECEIVED' ? styles.active : ''}`}
        >
          Depoda ({metrics.received})
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter('COMPLETED')}
          className={`${styles.operationalTabItem} ${statusFilter === 'COMPLETED' ? styles.active : ''}`}
        >
          Tamamlanan ({metrics.completed})
        </button>
      </div>

      {/* ── SEARCH & FILTER CONTROLS ─────────────────────────────────────────── */}
      <div className={styles.filterBar}>
        <form onSubmit={handleSearchSubmit} style={{ flex: 1, minWidth: '240px', display: 'flex', gap: '8px' }}>
          <input
            type="text"
            placeholder="İade no, sipariş no veya müşteri adı ile ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.input}
          />
          <button type="submit" className={styles.secondaryButton}>
            Ara
          </button>
        </form>
      </div>

      {/* ── RETURNS TABLE ───────────────────────────────────────────────────── */}
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Talep No</th>
              <th>Sipariş No</th>
              <th>Müşteri</th>
              <th>Tür</th>
              <th>İade Nedeni</th>
              <th>Durum</th>
              <th>Tarih</th>
              <th style={{ textAlign: 'right' }}>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  İade ve değişim talepleri taranıyor...
                </td>
              </tr>
            ) : returns.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className={styles.emptyState}>
                    <div className={styles.emptyStateTitle}>İade Talebi Bulunamadı</div>
                    <div className={styles.emptyStateDesc}>
                      {searchQuery ? `"${searchQuery}" aramasına uygun talep bulunamadı.` : 'Kriterlere uygun bekleyen veya tamamlanmış bir iade talebi bulunmuyor.'}
                    </div>
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('')
                          fetchReturns()
                        }}
                        className={styles.secondaryButton}
                      >
                        Aramayı Temizle
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              returns.map((r) => {
                const statusMeta = getReturnStatusConfig(r.status)
                return (
                  <tr key={r.id}>
                    <td>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          fontSize: '12px',
                          color: 'var(--text-primary)',
                          background: 'var(--surface-1)',
                          padding: '2px 6px',
                          borderRadius: 'var(--radius-xs)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        #{r.returnNumber}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      <Link href={`/admin/orders/${r.orderNumber}`} style={{ color: 'var(--brand-blue, #0080c4)' }}>
                        #{r.orderNumber}
                      </Link>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {r.user?.fullName || 'Müşteri'}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {r.user?.email}
                      </div>
                    </td>
                    <td>
                      <span
                        className={styles.badge}
                        style={{
                          background: r.type === 'EXCHANGE' ? 'rgba(124, 58, 237, 0.1)' : 'var(--surface-1)',
                          color: r.type === 'EXCHANGE' ? '#7c3aed' : 'var(--text-secondary)',
                          fontSize: '11px',
                        }}
                      >
                        {r.type === 'EXCHANGE' ? 'Değişim' : 'İade'}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '220px' }}>
                      {r.reason}
                    </td>
                    <td>
                      <span className={`${styles.badge} ${statusMeta.badgeClass}`}>
                        {statusMeta.label}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {new Date(r.requestedAt).toLocaleDateString('tr-TR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        href={`/admin/returns/${r.returnNumber}`}
                        className={styles.secondaryButton}
                        style={{ padding: '4px 10px', fontSize: '12px' }}
                      >
                        Yönet →
                      </Link>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
