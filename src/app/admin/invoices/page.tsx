'use client'

import React, { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { formatPrice } from '@/lib/utils'
import { getInvoiceStatusConfig } from '@/lib/constants/admin-status'
import Modal from '@/components/common/Modal'
import styles from '../admin.module.css'

interface InvoiceItem {
  id: string
  orderNumber: string
  invoiceNumber: string | null
  invoiceType: 'E_FATURA' | 'E_ARSIV'
  status: string
  totalAmount: number
  subtotal?: number
  taxAmount?: number
  currency: string
  provider: string
  createdAt: string
  issuedAt?: string | null
  errorMessage?: string | null
  pdfUrl?: string | null
  billingSnapshot: {
    fullName: string
    companyName?: string | null
    type?: string
    vknTckn?: string | null
    taxOffice?: string | null
    addressLine?: string | null
    district?: string | null
    city?: string | null
    country?: string | null
  }
}

export default function AdminInvoicesPage() {
  const { token } = useAuthStore()
  const [invoices, setInvoices] = useState<InvoiceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [search, setSearch] = useState('')
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceItem | null>(null)

  const loadInvoices = () => {
    if (!token) return
    setLoading(true)

    const params = new URLSearchParams()
    if (statusFilter !== 'ALL') params.set('status', statusFilter)
    if (typeFilter !== 'ALL') params.set('type', typeFilter)
    if (search.trim()) params.set('search', search.trim())

    fetch(`/api/admin/invoices?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.invoices)) {
          setInvoices(data.invoices)
        }
      })
      .catch((err) => console.error('Invoices fetch error:', err))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadInvoices()
  }, [token, statusFilter, typeFilter])

  // Real KPI metrics calculated directly from fetched backend data
  const metrics = useMemo(() => {
    const totalCount = invoices.length
    const eArsivCount = invoices.filter((i) => i.invoiceType === 'E_ARSIV').length
    const eFaturaCount = invoices.filter((i) => i.invoiceType === 'E_FATURA').length
    const issuedCount = invoices.filter((i) => i.status === 'ISSUED' || i.status === 'SENT' || i.status === 'PAID').length
    const failedCount = invoices.filter((i) => i.status === 'FAILED').length
    const pendingCount = invoices.filter((i) => i.status === 'PENDING' || i.status === 'SUBMITTED' || i.status === 'CREATED').length
    const totalSum = invoices.reduce((acc, i) => acc + (i.totalAmount || 0), 0)

    return { totalCount, eArsivCount, eFaturaCount, issuedCount, failedCount, pendingCount, totalSum }
  }, [invoices])

  return (
    <div className={styles.pageContainer}>
      {/* Page Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>e-Fatura & e-Arşiv Yönetimi</h1>
          <p className={styles.pageSubtitle}>
            Uyumsoft e-Fatura / e-Arşiv entegrasyonu, resmi mali mühürlü belgeler, GİB durumları ve vergi kayıtları.
          </p>
        </div>
      </div>

      {/* KPI Metrics Strip */}
      <div className={styles.metricsStrip}>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Kayıtlı Fatura</div>
          <div className={styles.metricValue}>{metrics.totalCount}</div>
          <div className={styles.metricSub}>Toplam: {formatPrice(metrics.totalSum)}</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Resmi Kesildi</div>
          <div className={`${styles.metricValue} ${styles.metricSuccess}`}>{metrics.issuedCount}</div>
          <div className={styles.metricSub}>Mühürlü ve GİB Onaylı</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>e-Arşiv / e-Fatura</div>
          <div className={styles.metricValue}>{metrics.eArsivCount} / {metrics.eFaturaCount}</div>
          <div className={styles.metricSub}>Bireysel / Kurumsal VKN</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>İşlem Bekleyen</div>
          <div className={`${styles.metricValue} ${styles.metricWarning}`}>{metrics.pendingCount}</div>
          <div className={styles.metricSub}>GİB Kuyruğu & Taslak</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Hatalı Fatura</div>
          <div className={styles.metricValue} style={{ color: metrics.failedCount > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
            {metrics.failedCount}
          </div>
          <div className={styles.metricSub}>{metrics.failedCount > 0 ? 'Müdahale Gerekli' : 'Sorunsuz'}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className={styles.filterCard}>
        <div className={styles.filterRow}>
          <input
            type="text"
            placeholder="Fatura No, Sipariş No veya Alıcı / Firma Ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadInvoices()}
            className={styles.filterInput}
            style={{ minWidth: 260 }}
          />

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className={styles.filterSelect}
          >
            <option value="ALL">Tüm Belge Tipleri</option>
            <option value="E_ARSIV">e-Arşiv Fatura</option>
            <option value="E_FATURA">e-Fatura (Kurumsal VKN)</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={styles.filterSelect}
          >
            <option value="ALL">Tüm Durumlar</option>
            <option value="ISSUED">Resmi Kesildi (ISSUED / SENT)</option>
            <option value="SUBMITTED">GİB Kuyruğunda (SUBMITTED)</option>
            <option value="PENDING">Beklemede (PENDING)</option>
            <option value="FAILED">Hata (FAILED)</option>
            <option value="CANCELLED">İptal Edildi (CANCELLED)</option>
          </select>

          <button
            type="button"
            onClick={loadInvoices}
            className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}
          >
            Filtrele
          </button>
        </div>
      </div>

      {/* Invoices Table */}
      <div className={styles.tableCard}>
        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Fatura No</th>
                <th>Sipariş No</th>
                <th>Alıcı / Firma</th>
                <th>Belge Tipi</th>
                <th style={{ textAlign: 'right' }}>Toplam Tutar</th>
                <th>Sağlayıcı</th>
                <th>Durum</th>
                <th style={{ textAlign: 'right' }}>Tarih</th>
                <th style={{ textAlign: 'center' }}>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                    Faturalar yükleniyor...
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <div className={styles.emptyState}>
                      <div className={styles.emptyStateTitle}>Kayıtlı fatura bulunamadı</div>
                      <div className={styles.emptyStateDesc}>
                        {search || statusFilter !== 'ALL' || typeFilter !== 'ALL'
                          ? 'Belirtilen arama kriterlerine uygun e-fatura veya e-arşiv kaydı bulunmuyor.'
                          : 'Henüz sisteme yansımış bir fatura kaydı bulunmuyor.'}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => {
                  const statusCfg = getInvoiceStatusConfig(inv.status)
                  const isSuccess = inv.status === 'ISSUED' || inv.status === 'SENT' || inv.status === 'PAID'
                  return (
                    <tr key={inv.id}>
                      <td style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 600 }}>
                        {inv.invoiceNumber ? (
                          <span style={{ color: 'var(--brand-blue, var(--zuu-blue))' }}>{inv.invoiceNumber}</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>Numara Alınmadı</span>
                        )}
                      </td>
                      <td style={{ fontWeight: 500 }}>
                        <Link
                          href={`/admin/orders/${inv.orderNumber}`}
                          style={{ color: 'var(--text-primary)', textDecoration: 'none' }}
                        >
                          #{inv.orderNumber}
                        </Link>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>
                          {inv.billingSnapshot?.companyName || inv.billingSnapshot?.fullName || 'Bireysel Alıcı'}
                        </div>
                        {inv.billingSnapshot?.companyName && inv.billingSnapshot?.fullName && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            Yetkili: {inv.billingSnapshot.fullName}
                          </div>
                        )}
                      </td>
                      <td>
                        <span
                          className={`${styles.badge} ${
                            inv.invoiceType === 'E_FATURA' ? styles.badgeInfo : styles.badgeNeutral
                          }`}
                        >
                          {inv.invoiceType === 'E_FATURA' ? 'e-Fatura' : 'e-Arşiv'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'var(--font-mono, monospace)' }}>
                        {formatPrice(inv.totalAmount)}
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                        {inv.provider || 'UYUMSOFT'}
                      </td>
                      <td>
                        <span className={`${styles.badge} ${styles[statusCfg.badgeClass] || styles.badgeNeutral}`}>
                          {statusCfg.label}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: 12 }}>
                        {new Date(inv.createdAt).toLocaleDateString('tr-TR', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          <button
                            type="button"
                            onClick={() => setSelectedInvoice(inv)}
                            className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}
                          >
                            Detay
                          </button>
                          {isSuccess && (
                            <a
                              href={`/api/admin/orders/${inv.orderNumber}/invoice/document`}
                              target="_blank"
                              rel="noreferrer"
                              className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`}
                              title="Resmi PDF Belgesini İndir"
                            >
                              PDF ↗
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice Detail Modal (UI-16 Global Modal) */}
      {selectedInvoice && (
        <Modal
          isOpen={Boolean(selectedInvoice)}
          onClose={() => setSelectedInvoice(null)}
          ariaLabel="Fatura Detayı"
          maxWidth={680}
        >
          <div style={{ padding: '4px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    Fatura #{selectedInvoice.invoiceNumber || selectedInvoice.id}
                  </h3>
                  <span
                    className={`${styles.badge} ${
                      selectedInvoice.invoiceType === 'E_FATURA' ? styles.badgeInfo : styles.badgeNeutral
                    }`}
                  >
                    {selectedInvoice.invoiceType === 'E_FATURA' ? 'e-Fatura' : 'e-Arşiv'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Sipariş:{' '}
                  <Link href={`/admin/orders/${selectedInvoice.orderNumber}`} style={{ color: 'var(--zuu-blue)' }}>
                    #{selectedInvoice.orderNumber}
                  </Link>{' '}
                  · Entegratör: {selectedInvoice.provider || 'UYUMSOFT'}
                </div>
              </div>
              <span
                className={`${styles.badge} ${
                  styles[getInvoiceStatusConfig(selectedInvoice.status).badgeClass] || styles.badgeNeutral
                }`}
              >
                {getInvoiceStatusConfig(selectedInvoice.status).label}
              </span>
            </div>

            {selectedInvoice.errorMessage && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 12,
                  marginBottom: 16,
                  color: 'var(--danger)',
                  fontSize: 12,
                }}
              >
                <strong>GİB / Uyumsoft Entegrasyon Hatası:</strong>
                <div style={{ marginTop: 4 }}>{selectedInvoice.errorMessage}</div>
              </div>
            )}

            <div className={styles.detailGrid} style={{ gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              {/* Billing Snapshot */}
              <div className={styles.cardPanel}>
                <div className={styles.panelHeader}>
                  <div className={styles.panelTitle}>Mükellef / Fatura Bilgileri</div>
                </div>
                <div className={styles.panelBody}>
                  <div className={styles.infoList}>
                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>Unvan / İsim:</span>
                      <span className={styles.infoValue}>
                        {selectedInvoice.billingSnapshot?.companyName || selectedInvoice.billingSnapshot?.fullName || '—'}
                      </span>
                    </div>
                    {selectedInvoice.billingSnapshot?.companyName && (
                      <div className={styles.infoRow}>
                        <span className={styles.infoLabel}>Yetkili Kişi:</span>
                        <span className={styles.infoValue}>{selectedInvoice.billingSnapshot.fullName}</span>
                      </div>
                    )}
                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>VKN / TCKN:</span>
                      <span className={styles.infoValue} style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                        {selectedInvoice.billingSnapshot?.vknTckn || '11111111111 (Nihai Tüketici)'}
                      </span>
                    </div>
                    {selectedInvoice.billingSnapshot?.taxOffice && (
                      <div className={styles.infoRow}>
                        <span className={styles.infoLabel}>Vergi Dairesi:</span>
                        <span className={styles.infoValue}>{selectedInvoice.billingSnapshot.taxOffice}</span>
                      </div>
                    )}
                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>Adres:</span>
                      <span className={styles.infoValue}>
                        {[
                          selectedInvoice.billingSnapshot?.addressLine,
                          selectedInvoice.billingSnapshot?.district,
                          selectedInvoice.billingSnapshot?.city,
                          selectedInvoice.billingSnapshot?.country,
                        ]
                          .filter(Boolean)
                          .join(' / ') || 'Adres bilgisi mevcut değil'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Financial Snapshot */}
              <div className={styles.cardPanel}>
                <div className={styles.panelHeader}>
                  <div className={styles.panelTitle}>Mali & Vergi Tutarları</div>
                </div>
                <div className={styles.panelBody}>
                  <div className={styles.infoList}>
                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>Matrah (KDV Hariç):</span>
                      <span className={styles.infoValue} style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                        {formatPrice(selectedInvoice.subtotal ?? selectedInvoice.totalAmount / 1.2)}
                      </span>
                    </div>
                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>Hesaplanan KDV (%20):</span>
                      <span className={styles.infoValue} style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                        {formatPrice(
                          selectedInvoice.taxAmount ??
                            selectedInvoice.totalAmount - selectedInvoice.totalAmount / 1.2
                        )}
                      </span>
                    </div>
                    <div className={styles.infoRow} style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
                      <span className={styles.infoLabel} style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                        Genel Toplam:
                      </span>
                      <span
                        className={styles.infoValue}
                        style={{
                          fontWeight: 700,
                          fontSize: 15,
                          color: 'var(--text-primary)',
                          fontFamily: 'var(--font-mono, monospace)',
                        }}
                      >
                        {formatPrice(selectedInvoice.totalAmount)}
                      </span>
                    </div>
                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>Düzenleme Tarihi:</span>
                      <span className={styles.infoValue}>
                        {new Date(selectedInvoice.issuedAt || selectedInvoice.createdAt).toLocaleString('tr-TR')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <Link
                href={`/admin/orders/${selectedInvoice.orderNumber}`}
                className={`${styles.btn} ${styles.btnSecondary}`}
              >
                Sipariş Detayına Git
              </Link>
              {(selectedInvoice.status === 'ISSUED' || selectedInvoice.status === 'SENT' || selectedInvoice.status === 'PAID') && (
                <a
                  href={`/api/admin/orders/${selectedInvoice.orderNumber}/invoice/document`}
                  target="_blank"
                  rel="noreferrer"
                  className={`${styles.btn} ${styles.btnPrimary}`}
                >
                  Resmi PDF Görüntüle ↗
                </a>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
