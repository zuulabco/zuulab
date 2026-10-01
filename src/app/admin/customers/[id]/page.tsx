'use client'

import React, { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import { formatPrice } from '@/lib/utils'
import Modal from '@/components/common/Modal'
import { getCustomerStatusConfig, getOrderStatusConfig } from '@/lib/constants/admin-status'
import styles from '../../admin.module.css'

export default function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const resolvedParams = use(params)
  const { id } = resolvedParams
  const { token, canFetch } = useAuthStore()
  const { addToast } = useToastStore()

  const [customer, setCustomer] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Suspend modal state
  const [isSuspendModalOpen, setIsSuspendModalOpen] = useState(false)
  const [suspendReason, setSuspendReason] = useState('')
  const [updatingStatus, setUpdatingStatus] = useState(false)

  const loadCustomer = async () => {
    if (!canFetch || !id) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/customers/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success && data.customer) {
        setCustomer(data.customer)
      } else {
        setError(data.error || 'Müşteri detayları alınamadı.')
      }
    } catch {
      setError('Müşteri verileri yüklenirken bağlantı hatası oluştu.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCustomer()
  }, [token, canFetch, id])

  const handleStatusChange = async (targetStatus: 'ACTIVE' | 'SUSPENDED') => {
    if (!canFetch) return
    setUpdatingStatus(true)
    try {
      const res = await fetch(`/api/admin/customers/${id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: targetStatus,
          reason: suspendReason.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (data.success) {
        addToast(
          targetStatus === 'SUSPENDED'
            ? 'Müşteri hesabı askıya alındı.'
            : 'Müşteri hesabı başarıyla aktifleştirildi.',
          'success'
        )
        setIsSuspendModalOpen(false)
        setSuspendReason('')
        loadCustomer()
      } else {
        addToast(data.error || 'İşlem başarısız oldu.', 'error')
      }
    } catch {
      addToast('Müşteri durumu güncellenirken bağlantı hatası oluştu.', 'error')
    } finally {
      setUpdatingStatus(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Müşteri 360° profili yükleniyor...
        </div>
      </div>
    )
  }

  if (!customer) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <Link href="/admin/customers" className={styles.secondaryButton}>
            ← Müşteri Listesine Dön
          </Link>
        </div>
        <div style={{ padding: '16px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 'var(--radius-sm)' }}>
          {error || 'Müşteri bulunamadı.'}
        </div>
      </div>
    )
  }

  const isSuspended = customer.status === 'SUSPENDED'
  const statusMeta = getCustomerStatusConfig(customer.status)
  const orders = customer.orders || []
  const totalSpend = customer.totalSpend || orders.reduce((sum: number, o: any) => sum + (o.totalAmount || 0), 0)
  const aov = orders.length > 0 ? totalSpend / orders.length : 0

  return (
    <div className={styles.container}>
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <Link href="/admin/customers" className={styles.secondaryButton} style={{ padding: '4px 10px', fontSize: '12px' }}>
              ← Müşteriler
            </Link>
            <h1 className={styles.title} style={{ margin: 0 }}>
              {customer.name || 'İsimsiz Müşteri'}
            </h1>
            <span className={`${styles.badge} ${statusMeta.badgeClass}`}>
              {statusMeta.label}
            </span>
          </div>
          <p className={styles.subtitle} style={{ marginTop: '6px' }}>
            Müşteri ID: <code style={{ fontFamily: 'var(--font-mono)' }}>{customer.id}</code> · Kayıt:{' '}
            {customer.createdAt ? new Date(customer.createdAt).toLocaleDateString('tr-TR') : '-'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {isSuspended ? (
            <button
              onClick={() => handleStatusChange('ACTIVE')}
              disabled={updatingStatus}
              className={`${styles.btn} ${styles.btnPrimary}`}
              style={{ background: '#16a34a', borderColor: '#15803d' }}
            >
              Hesabı Aktifleştir
            </button>
          ) : (
            <button
              onClick={() => setIsSuspendModalOpen(true)}
              className={`${styles.btn} ${styles.btnSecondary}`}
              style={{ color: '#dc2626', borderColor: '#fca5a5' }}
            >
              Hesabı Askıya Al
            </button>
          )}
        </div>
      </div>

      {/* ── METRIC STATS STRIP ──────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div
          style={{
            background: 'var(--surface-0)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '14px 16px',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Toplam Sipariş
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {orders.length}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Başarılı sipariş adedi
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
            Yaşam Boyu Değer (LTV)
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--brand-blue, #0080c4)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {formatPrice(totalSpend)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Toplam harcanan tutar
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
            Ortalama Sepet Tutarı (AOV)
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#16a34a', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {formatPrice(aov)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Sipariş başına ortalama
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
            Favori Ürünler
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {customer.favoritesCount || 0}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Kaydedilen liste öğesi
          </div>
        </div>
      </div>

      {/* ── 2-COLUMN OPERATIONAL GRID ────────────────────────────────────────── */}
      <div className={styles.detailGrid}>
        {/* LEFT COLUMN: Orders & Addresses */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Order History */}
          <div className={styles.orderSummaryBox}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div className={styles.summaryTitle} style={{ margin: 0 }}>Sipariş Geçmişi</div>
              <Link
                href={`/admin/orders?search=${encodeURIComponent(customer.email)}`}
                className={styles.secondaryButton}
                style={{ padding: '3px 8px', fontSize: '11px' }}
              >
                Tüm Siparişleri Gör ↗
              </Link>
            </div>

            {orders.length > 0 ? (
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Sipariş No</th>
                      <th>Tarih</th>
                      <th>Durum</th>
                      <th>Ürünler</th>
                      <th style={{ textAlign: 'right' }}>Toplam</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o: any) => {
                      const orderStatusMeta = getOrderStatusConfig(o.status)
                      return (
                        <tr key={o.id}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                            <Link href={`/admin/orders/${o.orderNumber}`} style={{ color: 'var(--brand-blue, #0080c4)' }}>
                              #{o.orderNumber}
                            </Link>
                          </td>
                          <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            {new Date(o.createdAt).toLocaleDateString('tr-TR')}
                          </td>
                          <td>
                            <span className={`${styles.badge} ${orderStatusMeta.badgeClass}`}>
                              {orderStatusMeta.label}
                            </span>
                          </td>
                          <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {o.items?.length || 1} Kalem Ürün
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                            {formatPrice(o.totalAmount)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                Bu müşteriye ait henüz verilmiş bir sipariş bulunmuyor.
              </div>
            )}
          </div>

          {/* Saved Addresses */}
          <div className={styles.orderSummaryBox}>
            <div className={styles.summaryTitle}>Kayıtlı Teslimat Adresleri</div>
            {customer.addresses && customer.addresses.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                {customer.addresses.map((addr: any, idx: number) => (
                  <div
                    key={idx}
                    style={{
                      padding: '12px',
                      background: 'var(--surface-1)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '13px',
                      lineHeight: 1.5,
                    }}
                  >
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                      {addr.title || `Adres #${idx + 1}`}
                    </div>
                    <div style={{ color: 'var(--text-secondary)' }}>
                      {addr.addressLine || addr.address}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>
                      {addr.district} / {addr.city} {addr.postalCode || ''}
                    </div>
                    {addr.phone && (
                      <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px' }}>
                        Tel: {addr.phone}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                Kayıtlı adres bilgisi bulunmuyor.
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: 360 Operational Links & Profile Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Customer Operations Quick Links */}
          <div className={styles.orderSummaryBox}>
            <div className={styles.summaryTitle}>Müşteri 360° Operasyonları</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <Link
                href={`/admin/orders?search=${encodeURIComponent(customer.email)}`}
                className={`${styles.btn} ${styles.btnSecondary}`}
                style={{ justifyContent: 'space-between', display: 'flex', padding: '8px 12px' }}
              >
                <span>Sipariş Kayıtları</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{orders.length} Adet →</span>
              </Link>
              <Link
                href={`/admin/returns?search=${encodeURIComponent(customer.name)}`}
                className={`${styles.btn} ${styles.btnSecondary}`}
                style={{ justifyContent: 'space-between', display: 'flex', padding: '8px 12px' }}
              >
                <span>İade & Değişim Talepleri</span>
                <span>İncele →</span>
              </Link>
              <Link
                href={`/admin/support?search=${encodeURIComponent(customer.email)}`}
                className={`${styles.btn} ${styles.btnSecondary}`}
                style={{ justifyContent: 'space-between', display: 'flex', padding: '8px 12px' }}
              >
                <span>Destek Biletleri</span>
                <span>Görüşmeler →</span>
              </Link>
              <Link
                href={`/admin/reviews?search=${encodeURIComponent(customer.name)}`}
                className={`${styles.btn} ${styles.btnSecondary}`}
                style={{ justifyContent: 'space-between', display: 'flex', padding: '8px 12px' }}
              >
                <span>Müşteri Değerlendirmeleri</span>
                <span>Yorumlar →</span>
              </Link>
            </div>
          </div>

          {/* Profile & Communication Details */}
          <div className={styles.orderSummaryBox}>
            <div className={styles.summaryTitle}>İletişim & Profil Bilgileri</div>
            <div className={styles.summaryRow}>
              <span>E-posta:</span>
              <strong style={{ color: 'var(--text-primary)' }}>{customer.email}</strong>
            </div>
            <div className={styles.summaryRow}>
              <span>Telefon:</span>
              <span>{customer.phone || 'Girilmemiş'}</span>
            </div>
            <div className={styles.summaryRow}>
              <span>Kayıt Tarihi:</span>
              <span>{customer.createdAt ? new Date(customer.createdAt).toLocaleDateString('tr-TR') : '-'}</span>
            </div>
            <div className={styles.summaryRow}>
              <span>Hesap Durumu:</span>
              <span className={`${styles.badge} ${statusMeta.badgeClass}`}>{statusMeta.label}</span>
            </div>
            <div className={styles.summaryRow}>
              <span>Son Sipariş:</span>
              <span>{customer.lastOrderDate ? new Date(customer.lastOrderDate).toLocaleDateString('tr-TR') : 'Yok'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── SUSPEND ACCOUNT MODAL ────────────────────────────────────────────── */}
      <Modal
        isOpen={isSuspendModalOpen}
        onClose={() => setIsSuspendModalOpen(false)}
        ariaLabel="Hesabı Askıya Alma Onayı"
        maxWidth={460}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 4px', color: 'var(--text-primary)' }}>
              Müşteri Hesabını Askıya Al
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
              {customer.name} ({customer.email})
            </p>
          </div>

          <div
            style={{
              padding: '12px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 'var(--radius-sm)',
              fontSize: '12px',
              color: '#991b1b',
              lineHeight: 1.5,
            }}
          >
            Hesap askıya alındığında müşteri vitrine giriş yapamaz ve yeni sipariş veremez. Mevcut aktif siparişleri ve geçmişi korunur.
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
              Askıya Alma Gerekçesi (Opsiyonel)
            </label>
            <textarea
              rows={3}
              placeholder="Örn: Mükerrer şüpheli işlem veya güvenlik teyidi..."
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              className={styles.textarea}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={() => setIsSuspendModalOpen(false)}
              className={styles.secondaryButton}
            >
              Vazgeç
            </button>
            <button
              type="button"
              disabled={updatingStatus}
              onClick={() => handleStatusChange('SUSPENDED')}
              className={styles.primaryButton}
              style={{ background: '#dc2626', borderColor: '#b91c1c' }}
            >
              {updatingStatus ? 'İşleniyor...' : 'Hesabı Askıya Al'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
