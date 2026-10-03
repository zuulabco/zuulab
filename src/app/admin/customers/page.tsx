'use client'

import React, { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import { formatPrice } from '@/lib/utils'
import { getCustomerStatusConfig } from '@/lib/constants/admin-status'
import styles from '../admin.module.css'
import { SkeletonRows } from '@/components/common/Skeleton'

interface Customer {
  id: string
  name: string
  email: string
  phone?: string | null
  status: 'ACTIVE' | 'SUSPENDED'
  orderCount?: number
  totalOrders?: number
  totalSpend: number
  lastOrderDate?: string | null
  createdAt: string
}

export default function AdminCustomersPage() {
  const { token, canFetch } = useAuthStore()
  const { addToast } = useToastStore()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED'>('ALL')

  const loadCustomers = async () => {
    if (!canFetch) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      if (statusFilter !== 'ALL') params.set('status', statusFilter)

      const res = await fetch(`/api/admin/customers?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success && Array.isArray(data.customers)) {
        setCustomers(data.customers)
      } else {
        addToast(data.error || 'Müşteri listesi alınamadı.', 'error')
      }
    } catch {
      addToast('Müşteri verileri yüklenirken bağlantı hatası oluştu.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCustomers()
  }, [token, canFetch, statusFilter])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    loadCustomers()
  }

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = customers.length
    const active = customers.filter((c) => c.status === 'ACTIVE').length
    const suspended = customers.filter((c) => c.status === 'SUSPENDED').length
    const totalSpend = customers.reduce((sum, c) => sum + (c.totalSpend || 0), 0)
    return { total, active, suspended, totalSpend }
  }, [customers])

  return (
    <div className={styles.container}>
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Müşteri Yönetimi</h1>
          <p className={styles.subtitle}>
            Kayıtlı kullanıcı profilleri, sipariş geçmişleri, müşteri değeri ve hesap durumlarını yönetin.
          </p>
        </div>

        <a
          href="/api/admin/export?type=customers"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.secondaryButton}
        >
          ↓ Müşterileri CSV İndir
        </a>
      </div>

      {/* ── METRIC STATS CARDS ──────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div
          onClick={() => setStatusFilter('ALL')}
          className={`${styles.selectableCard} ${statusFilter === 'ALL' ? styles.selectableCardActive : ''}`}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Toplam Müşteri
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {metrics.total}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Kayıtlı kullanıcı hesapları
          </div>
        </div>

        <div
          onClick={() => setStatusFilter('ACTIVE')}
          className={`${styles.selectableCard} ${statusFilter === 'ACTIVE' ? styles.selectableCardActive : ''}`}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Aktif Hesaplar
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#16a34a', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {metrics.active}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Alışverişe açık müşteriler
          </div>
        </div>

        <div
          onClick={() => setStatusFilter('SUSPENDED')}
          className={`${styles.selectableCard} ${statusFilter === 'SUSPENDED' ? styles.selectableCardActive : ''}`}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Askıya Alınanlar
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: metrics.suspended > 0 ? '#dc2626' : 'var(--text-muted)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {metrics.suspended}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Kısıtlanmış hesaplar
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
            Toplam Müşteri Cirosu
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--brand-blue, #0080c4)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {formatPrice(metrics.totalSpend)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Müşteri harcama hacmi
          </div>
        </div>
      </div>

      {/* ── SEARCH & FILTER CONTROLS ─────────────────────────────────────────── */}
      <div className={styles.filterBar}>
        <form onSubmit={handleSearchSubmit} style={{ flex: 1, minWidth: '240px', display: 'flex', gap: '8px' }}>
          <input
            type="text"
            placeholder="İsim, e-posta veya telefon ile ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.input}
          />
          <button type="submit" className={styles.secondaryButton}>
            Ara
          </button>
        </form>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className={styles.select}
          style={{ width: 'auto' }}
        >
          <option value="ALL">Tüm Durumlar ({metrics.total})</option>
          <option value="ACTIVE">Aktif Müşteriler ({metrics.active})</option>
          <option value="SUSPENDED">Askıya Alınanlar ({metrics.suspended})</option>
        </select>
      </div>

      {/* ── CUSTOMERS TABLE ─────────────────────────────────────────────────── */}
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Müşteri</th>
              <th>İletişim</th>
              <th style={{ textAlign: 'center' }}>Sipariş Sayısı</th>
              <th style={{ textAlign: 'right' }}>Toplam Harcama</th>
              <th>Son Sipariş</th>
              <th>Durum</th>
              <th style={{ textAlign: 'right' }}>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows rows={6} cols={7} />
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className={styles.emptyState}>
                    <div className={styles.emptyStateTitle}>Müşteri Bulunamadı</div>
                    <div className={styles.emptyStateDesc}>
                      {search ? `"${search}" kriterlerine uygun müşteri bulunamadı.` : 'Henüz kayıtlı bir müşteri bulunmuyor.'}
                    </div>
                    {search && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearch('')
                          loadCustomers()
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
              customers.map((c) => {
                const statusMeta = getCustomerStatusConfig(c.status)
                const orders = c.orderCount ?? c.totalOrders ?? 0
                const initials = c.name
                  ? c.name
                      .split(' ')
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()
                  : 'M'

                return (
                  <tr key={c.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: 'var(--surface-1)',
                            border: '1px solid var(--border)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '11px',
                            fontWeight: 700,
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {initials}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            <Link href={`/admin/customers/${c.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                              {c.name}
                            </Link>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                            #{c.id.slice(-8)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{c.email}</div>
                      {c.phone && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.phone}</div>}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <Link
                        href={`/admin/orders?search=${encodeURIComponent(c.email)}`}
                        className={styles.badge}
                        style={{
                          background: 'var(--surface-1)',
                          color: 'var(--text-primary)',
                          textDecoration: 'none',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 600,
                        }}
                      >
                        {orders} Sipariş ↗
                      </Link>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                      {formatPrice(c.totalSpend || 0)}
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {c.lastOrderDate
                        ? new Date(c.lastOrderDate).toLocaleDateString('tr-TR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })
                        : 'Henüz Yok'}
                    </td>
                    <td>
                      <span className={`${styles.badge} ${statusMeta.badgeClass}`}>
                        {statusMeta.label}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        href={`/admin/customers/${c.id}`}
                        className={styles.secondaryButton}
                        style={{ padding: '4px 10px', fontSize: '12px' }}
                      >
                        Detay 360° →
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
