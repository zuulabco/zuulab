'use client'

import React, { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import { formatPrice } from '@/lib/utils'
import Modal from '@/components/common/Modal'
import { getPaymentStatusConfig } from '@/lib/constants/admin-status'
import styles from '../admin.module.css'

interface PaymentItem {
  id: string
  orderNumber: string
  provider: string
  providerRef?: string | null
  providerToken?: string | null
  status: string
  amount: number
  currency: string
  attemptNumber?: number
  expiresAt?: string
  createdAt: string
  paidAt?: string | null
  failedAt?: string | null
  failureReason?: string | null
  ipAddress?: string | null
}

export default function AdminPaymentsPage() {
  const { token } = useAuthStore()
  const { addToast } = useToastStore()

  const [payments, setPayments] = useState<PaymentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [quickFilter, setQuickFilter] = useState<'ALL' | 'SUCCEEDED' | 'PENDING' | 'FAILED' | 'REFUNDED'>('ALL')
  const [providerFilter, setProviderFilter] = useState('ALL')
  const [search, setSearch] = useState('')
  const [selectedPayment, setSelectedPayment] = useState<PaymentItem | null>(null)
  const [cleanupLoading, setCleanupLoading] = useState(false)

  const loadPayments = async () => {
    if (!token) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (quickFilter !== 'ALL') params.set('status', quickFilter)
      if (providerFilter !== 'ALL') params.set('provider', providerFilter)
      if (search.trim()) params.set('search', search.trim())

      const res = await fetch(`/api/admin/payments?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success && Array.isArray(data.payments)) {
        setPayments(data.payments)
      } else {
        addToast(data.error || 'Ödeme kayıtları alınamadı.', 'error')
      }
    } catch {
      addToast('Ödeme verileri yüklenirken bağlantı hatası oluştu.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPayments()
  }, [token, quickFilter, providerFilter])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    loadPayments()
  }

  const handleCleanupExpired = async () => {
    if (!token) return
    setCleanupLoading(true)
    try {
      const res = await fetch('/api/admin/inventory/cleanup-expired', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        addToast(data.message || 'Süresi dolan provizyon ve stok rezervasyonları temizlendi.', 'success')
        loadPayments()
      } else {
        addToast('Temizlik işlemi tamamlanamadı.', 'error')
      }
    } catch {
      addToast('Temizlik işlemi sırasında bağlantı hatası oluştu.', 'error')
    } finally {
      setCleanupLoading(false)
    }
  }

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = payments.length
    const succeeded = payments.filter((p) => p.status === 'SUCCEEDED' || p.status === 'PAID').length
    const pending = payments.filter((p) => p.status === 'PENDING' || p.status === 'PROCESSING').length
    const failed = payments.filter((p) => p.status === 'FAILED').length
    const refunded = payments.filter((p) => p.status === 'REFUNDED' || p.status === 'PARTIALLY_REFUNDED').length
    const totalVolume = payments
      .filter((p) => p.status === 'SUCCEEDED' || p.status === 'PAID')
      .reduce((sum, p) => sum + (p.amount || 0), 0)
    return { total, succeeded, pending, failed, refunded, totalVolume }
  }, [payments])

  return (
    <div className={styles.container}>
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Ödemeler & Finans İşlemleri</h1>
          <p className={styles.subtitle}>
            Ödeme sağlayıcıları (PayTR / iyzico) işlem logları, tahsilatlar, provizyon denemeleri ve iade durumları.
          </p>
        </div>

        <button
          type="button"
          onClick={handleCleanupExpired}
          disabled={cleanupLoading}
          className={styles.secondaryButton}
          style={{ color: '#dc2626', borderColor: '#fca5a5' }}
        >
          {cleanupLoading ? 'Temizleniyor...' : 'Süresi Dolan Rezervasyonları Temizle'}
        </button>
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
          onClick={() => setQuickFilter('ALL')}
          className={`${styles.selectableCard} ${quickFilter === 'ALL' ? styles.selectableCardActive : ''}`}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Toplam İşlem
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {metrics.total}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Tüm ödeme denemeleri
          </div>
        </div>

        <div
          onClick={() => setQuickFilter('SUCCEEDED')}
          className={`${styles.selectableCard} ${quickFilter === 'SUCCEEDED' ? styles.selectableCardActive : ''}`}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Başarılı Tahsilat
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#16a34a', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {metrics.succeeded}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Onaylanan işlemler
          </div>
        </div>

        <div
          onClick={() => setQuickFilter('PENDING')}
          className={`${styles.selectableCard} ${quickFilter === 'PENDING' ? styles.selectableCardActive : ''}`}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Beklemede
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#d97706', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {metrics.pending}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            3D Secure / Provizyon
          </div>
        </div>

        <div
          onClick={() => setQuickFilter('FAILED')}
          className={`${styles.selectableCard} ${quickFilter === 'FAILED' ? styles.selectableCardActive : ''}`}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Başarısız
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: metrics.failed > 0 ? '#dc2626' : 'var(--text-muted)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {metrics.failed}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Reddedilen / Zaman aşımı
          </div>
        </div>

        <div
          style={{
            background: 'var(--surface-0)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '14px 16px',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Toplam Tahsilat Hacmi
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--brand-blue, #0080c4)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {formatPrice(metrics.totalVolume)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Net tahsil edilen tutar
          </div>
        </div>
      </div>

      {/* ── OPERATIONAL TABS ─────────────────────────────────────────────────── */}
      <div className={styles.operationalTabs}>
        <button
          type="button"
          onClick={() => setQuickFilter('ALL')}
          className={`${styles.operationalTabItem} ${quickFilter === 'ALL' ? styles.active : ''}`}
        >
          Tüm İşlemler ({metrics.total})
        </button>
        <button
          type="button"
          onClick={() => setQuickFilter('SUCCEEDED')}
          className={`${styles.operationalTabItem} ${quickFilter === 'SUCCEEDED' ? styles.active : ''}`}
        >
          Başarılı ({metrics.succeeded})
        </button>
        <button
          type="button"
          onClick={() => setQuickFilter('PENDING')}
          className={`${styles.operationalTabItem} ${quickFilter === 'PENDING' ? styles.active : ''}`}
        >
          Bekleyen ({metrics.pending})
        </button>
        <button
          type="button"
          onClick={() => setQuickFilter('FAILED')}
          className={`${styles.operationalTabItem} ${quickFilter === 'FAILED' ? styles.active : ''}`}
        >
          Başarısız ({metrics.failed})
        </button>
        <button
          type="button"
          onClick={() => setQuickFilter('REFUNDED')}
          className={`${styles.operationalTabItem} ${quickFilter === 'REFUNDED' ? styles.active : ''}`}
        >
          İade Edilen ({metrics.refunded})
        </button>
      </div>

      {/* ── SEARCH & FILTER CONTROLS ─────────────────────────────────────────── */}
      <div className={styles.filterBar}>
        <form onSubmit={handleSearchSubmit} style={{ flex: 1, minWidth: '240px', display: 'flex', gap: '8px' }}>
          <input
            type="text"
            placeholder="İşlem ID, sipariş no veya referans kodu ile ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.input}
          />
          <button type="submit" className={styles.secondaryButton}>
            Ara
          </button>
        </form>

        <select
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value)}
          className={styles.select}
          style={{ width: 'auto' }}
        >
          <option value="ALL">Tüm Sağlayıcılar</option>
          <option value="PAYTR">PayTR</option>
          <option value="IYZICO">iyzico</option>
          <option value="STRIPE">Stripe</option>
          <option value="MANUAL">Manuel Havale</option>
        </select>
      </div>

      {/* ── PAYMENTS TABLE ──────────────────────────────────────────────────── */}
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>İşlem ID / Ref</th>
              <th>Sipariş No</th>
              <th>Sağlayıcı</th>
              <th style={{ textAlign: 'right' }}>Tutar</th>
              <th>Durum</th>
              <th>Deneme</th>
              <th>Tarih</th>
              <th style={{ textAlign: 'right' }}>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Ödeme kayıtları yükleniyor...
                </td>
              </tr>
            ) : payments.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className={styles.emptyState}>
                    <div className={styles.emptyStateTitle}>Ödeme Kaydı Bulunamadı</div>
                    <div className={styles.emptyStateDesc}>
                      {search ? `"${search}" kriterine uygun işlem bulunamadı.` : 'Kriterlere uygun finansal işlem kaydı bulunmuyor.'}
                    </div>
                    {search && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearch('')
                          loadPayments()
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
              payments.map((p) => {
                const statusMeta = getPaymentStatusConfig(p.status)
                return (
                  <tr key={p.id}>
                    <td>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '12px',
                          color: 'var(--text-primary)',
                          background: 'var(--surface-1)',
                          padding: '2px 6px',
                          borderRadius: 'var(--radius-xs)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        {p.providerRef || p.id.slice(-10)}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      <Link href={`/admin/orders/${p.orderNumber}`} style={{ color: 'var(--brand-blue, #0080c4)' }}>
                        #{p.orderNumber}
                      </Link>
                    </td>
                    <td>
                      <span
                        className={styles.badge}
                        style={{
                          background: 'var(--surface-1)',
                          color: 'var(--text-secondary)',
                          fontSize: '11px',
                          fontWeight: 600,
                        }}
                      >
                        {p.provider}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                      {formatPrice(p.amount)}
                    </td>
                    <td>
                      <span className={`${styles.badge} ${statusMeta.badgeClass}`}>
                        {statusMeta.label}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {p.attemptNumber ? `#${p.attemptNumber}` : '-'}
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {new Date(p.createdAt).toLocaleDateString('tr-TR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => setSelectedPayment(p)}
                        className={styles.secondaryButton}
                        style={{ padding: '4px 10px', fontSize: '12px' }}
                      >
                        Detay
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── PAYMENT DETAIL MODAL ────────────────────────────────────────────── */}
      <Modal
        isOpen={Boolean(selectedPayment)}
        onClose={() => setSelectedPayment(null)}
        ariaLabel="Ödeme İşlem Detayı"
        maxWidth={480}
      >
        {selectedPayment && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Ödeme İşlem Detayı
                </h3>
                <span className={`${styles.badge} ${getPaymentStatusConfig(selectedPayment.status).badgeClass}`}>
                  {getPaymentStatusConfig(selectedPayment.status).label}
                </span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-mono)' }}>
                Ref: {selectedPayment.providerRef || selectedPayment.id}
              </p>
            </div>

            <div className={styles.orderSummaryBox}>
              <div className={styles.summaryRow}>
                <span>Sipariş Numarası:</span>
                <Link
                  href={`/admin/orders/${selectedPayment.orderNumber}`}
                  style={{ color: 'var(--brand-blue, #0080c4)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}
                >
                  #{selectedPayment.orderNumber} ↗
                </Link>
              </div>
              <div className={styles.summaryRow}>
                <span>Ödeme Sağlayıcısı:</span>
                <strong>{selectedPayment.provider}</strong>
              </div>
              <div className={styles.summaryRow}>
                <span>İşlem Tutarı:</span>
                <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'var(--text-primary)' }}>
                  {formatPrice(selectedPayment.amount)} {selectedPayment.currency}
                </strong>
              </div>
              <div className={styles.summaryRow}>
                <span>Oluşturulma:</span>
                <span>{new Date(selectedPayment.createdAt).toLocaleString('tr-TR')}</span>
              </div>
              {selectedPayment.paidAt && (
                <div className={styles.summaryRow}>
                  <span>Tahsil Edilme:</span>
                  <span style={{ color: '#16a34a', fontWeight: 600 }}>
                    {new Date(selectedPayment.paidAt).toLocaleString('tr-TR')}
                  </span>
                </div>
              )}
              {selectedPayment.failedAt && (
                <div className={styles.summaryRow}>
                  <span>Başarısız Olma:</span>
                  <span style={{ color: '#dc2626' }}>
                    {new Date(selectedPayment.failedAt).toLocaleString('tr-TR')}
                  </span>
                </div>
              )}
              {selectedPayment.failureReason && (
                <div style={{ marginTop: '8px', padding: '10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-sm)', fontSize: '12px', color: '#991b1b' }}>
                  <strong>Hata Nedeni:</strong> {selectedPayment.failureReason}
                </div>
              )}
              {selectedPayment.ipAddress && (
                <div className={styles.summaryRow}>
                  <span>İstemci IP Adresi:</span>
                  <code style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{selectedPayment.ipAddress}</code>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setSelectedPayment(null)}
                className={styles.secondaryButton}
              >
                Kapat
              </button>
              <Link
                href={`/admin/orders/${selectedPayment.orderNumber}`}
                className={styles.primaryButton}
              >
                Siparişi İncele →
              </Link>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
