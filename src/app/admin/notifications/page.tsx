'use client'

import React, { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/store/toastStore'
import { getNotificationStatusConfig } from '@/lib/constants/admin-status'
import Modal from '@/components/common/Modal'
import styles from '../admin.module.css'

interface NotificationItem {
  id: string
  orderNumber: string
  type: string
  channel: string
  status: string
  subject: string
  recipient: string
  provider: string
  providerMessageId?: string | null
  retryCount: number
  lastError?: string | null
  createdAt: string
  sentAt?: string | null
}

export default function AdminNotificationsPage() {
  const { token } = useAuthStore()
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [processing, setProcessing] = useState(false)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [selectedNotification, setSelectedNotification] = useState<NotificationItem | null>(null)

  const fetchNotifications = async () => {
    if (!token) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (typeFilter) params.set('type', typeFilter)
      if (searchQuery.trim()) params.set('search', searchQuery.trim())

      const res = await fetch(`/api/admin/notifications?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        setNotifications(data.notifications || [])
      } else {
        toast.error(data.error || 'Bildirimler yüklenemedi.')
      }
    } catch {
      toast.error('Bağlantı hatası oluştu.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNotifications()
  }, [token, statusFilter, typeFilter])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    fetchNotifications()
  }

  const handleProcessQueue = async () => {
    if (!token) return
    setProcessing(true)
    try {
      const res = await fetch('/api/admin/notifications/process', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        toast.success(data.message || 'Kuyruk başarıyla işlendi.')
        fetchNotifications()
      } else {
        toast.error(data.error || 'İşlem başarısız.')
      }
    } catch {
      toast.error('İşlem sırasında bağlantı hatası oluştu.')
    } finally {
      setProcessing(false)
    }
  }

  const handleRetryNotification = async (id: string) => {
    if (!token) return
    setRetryingId(id)
    try {
      const res = await fetch(`/api/admin/notifications/${id}/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Bildirim gönderimi yeniden sıraya alındı.')
        fetchNotifications()
        if (selectedNotification && selectedNotification.id === id) {
          setSelectedNotification(null)
        }
      } else {
        toast.error(data.error || 'Yeniden deneme başarısız.')
      }
    } catch {
      toast.error('Bağlantı hatası oluştu.')
    } finally {
      setRetryingId(null)
    }
  }

  // Real KPIs directly from state
  const metrics = useMemo(() => {
    const total = notifications.length
    const sent = notifications.filter((n) => n.status === 'SENT').length
    const pending = notifications.filter((n) => n.status === 'PENDING' || n.status === 'PROCESSING').length
    const failed = notifications.filter((n) => n.status === 'FAILED').length
    return { total, sent, pending, failed }
  }, [notifications])

  return (
    <div className={styles.pageContainer}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>İletişim & İşlemsel Bildirimler</h1>
          <p className={styles.pageSubtitle}>
            Sipariş, kargo, ödeme ve iade aşamalarındaki transactional e-posta/SMS gönderim logları ve kuyruk durumu.
          </p>
        </div>
        <button
          type="button"
          disabled={processing}
          onClick={handleProcessQueue}
          className={`${styles.btn} ${styles.btnPrimary}`}
        >
          {processing ? 'Kuyruk İşleniyor...' : 'Kuyruktaki Bildirimleri İşle'}
        </button>
      </div>

      {/* KPI Metrics Strip */}
      <div className={styles.metricsStrip}>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Toplam Bildirim Kaydı</div>
          <div className={styles.metricValue}>{metrics.total}</div>
          <div className={styles.metricSub}>Sistem Genelinde</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Başarıyla Gönderildi</div>
          <div className={`${styles.metricValue} ${styles.metricSuccess}`}>{metrics.sent}</div>
          <div className={styles.metricSub}>Teslim Edildi</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Kuyrukta Bekleyen</div>
          <div className={`${styles.metricValue} ${styles.metricWarning}`}>{metrics.pending}</div>
          <div className={styles.metricSub}>SMTP Gönderim Havuzu</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Başarısız / Hata</div>
          <div
            className={styles.metricValue}
            style={{ color: metrics.failed > 0 ? 'var(--danger)' : 'var(--text-muted)' }}
          >
            {metrics.failed}
          </div>
          <div className={styles.metricSub}>{metrics.failed > 0 ? 'Tekrar Deneme Gerekli' : 'Temiz'}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className={styles.filterCard}>
        <form onSubmit={handleSearchSubmit} className={styles.filterRow}>
          <input
            type="text"
            placeholder="Sipariş No, Alıcı E-posta veya Konu..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.filterInput}
            style={{ minWidth: 260 }}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={styles.filterSelect}
          >
            <option value="">Tüm Durumlar</option>
            <option value="SENT">Gönderildi (SENT)</option>
            <option value="PENDING">Kuyrukta (PENDING)</option>
            <option value="PROCESSING">İletiliyor (PROCESSING)</option>
            <option value="FAILED">Başarısız (FAILED)</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className={styles.filterSelect}
          >
            <option value="">Tüm Olay Tipleri</option>
            <option value="ORDER_CONFIRMED">Sipariş Onayı</option>
            <option value="PAYMENT_SUCCEEDED">Ödeme Başarılı</option>
            <option value="PAYMENT_FAILED">Ödeme Başarısız</option>
            <option value="ORDER_PREPARING">Sipariş Hazırlanıyor</option>
            <option value="SHIPMENT_CREATED">Kargo Oluşturuldu</option>
            <option value="ORDER_SHIPPED">Kargoya Verildi</option>
            <option value="OUT_FOR_DELIVERY">Dağıtıma Çıktı</option>
            <option value="ORDER_DELIVERED">Teslim Edildi</option>
            <option value="ORDER_CANCELLED">Sipariş İptal</option>
          </select>

          <button
            type="submit"
            className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}
          >
            Filtrele
          </button>
        </form>
      </div>

      {/* Notifications Table */}
      <div className={styles.tableCard}>
        <div className={styles.tableWrapper}>
          <table className={styles.adminTable}>
            <thead>
              <tr>
                <th>Sipariş No</th>
                <th>Olay Tipi</th>
                <th>Alıcı</th>
                <th>Konu</th>
                <th>Durum</th>
                <th>Kanal / Sağlayıcı</th>
                <th style={{ textAlign: 'right' }}>Tarih</th>
                <th style={{ textAlign: 'center' }}>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                    Bildirim kayıtları yükleniyor...
                  </td>
                </tr>
              ) : notifications.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className={styles.emptyState}>
                      <div className={styles.emptyStateTitle}>Kayıtlı bildirim bulunamadı</div>
                      <div className={styles.emptyStateDesc}>
                        Arama kriterlerinize uygun sistem bildirimi kaydı bulunmuyor.
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                notifications.map((n) => {
                  const statusCfg = getNotificationStatusConfig(n.status)
                  return (
                    <tr key={n.id}>
                      <td style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 600 }}>
                        {n.orderNumber ? (
                          <Link
                            href={`/admin/orders/${n.orderNumber}`}
                            style={{ color: 'var(--brand-blue, var(--zuu-blue))', textDecoration: 'none' }}
                          >
                            #{n.orderNumber}
                          </Link>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`${styles.badge} ${styles.badgeInfo}`}
                          style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}
                        >
                          {n.type}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-primary)', fontSize: 13 }}>
                        {n.recipient}
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{n.subject}</div>
                        {n.lastError && (
                          <div style={{ color: 'var(--danger)', fontSize: 11, marginTop: 2 }}>
                            Hata: {n.lastError}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`${styles.badge} ${styles[statusCfg.badgeClass] || styles.badgeNeutral}`}>
                          {statusCfg.label}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {n.channel || 'EMAIL'} · {n.provider || 'Resend'}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: 12 }}>
                        {new Date(n.sentAt || n.createdAt).toLocaleDateString('tr-TR', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          <button
                            type="button"
                            onClick={() => setSelectedNotification(n)}
                            className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}
                          >
                            İncele
                          </button>
                          {n.status === 'FAILED' && (
                            <button
                              type="button"
                              disabled={retryingId === n.id}
                              onClick={() => handleRetryNotification(n.id)}
                              className={`${styles.btn} ${styles.btnDanger} ${styles.btnSm}`}
                            >
                              {retryingId === n.id ? 'Deneniyor...' : 'Tekrar Dene'}
                            </button>
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

      {/* Notification Detail Modal (UI-16 Global Modal) */}
      {selectedNotification && (
        <Modal
          isOpen={Boolean(selectedNotification)}
          onClose={() => setSelectedNotification(null)}
          ariaLabel="Bildirim Log Detayı"
          maxWidth={620}
        >
          <div style={{ padding: '4px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 4px', color: 'var(--text-primary)' }}>
                  Bildirim Kaydı Detayı
                </h3>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)' }}>
                  ID: {selectedNotification.id}
                </div>
              </div>
              <span
                className={`${styles.badge} ${
                  styles[getNotificationStatusConfig(selectedNotification.status).badgeClass] || styles.badgeNeutral
                }`}
              >
                {getNotificationStatusConfig(selectedNotification.status).label}
              </span>
            </div>

            {selectedNotification.lastError && (
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
                <strong>Son Gönderim Hatası:</strong>
                <div style={{ marginTop: 4 }}>{selectedNotification.lastError}</div>
                <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>
                  Yeniden deneme sayısı: {selectedNotification.retryCount}
                </div>
              </div>
            )}

            <div className={styles.cardPanel} style={{ marginBottom: 16 }}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitle}>İletim Bilgileri</div>
              </div>
              <div className={styles.panelBody}>
                <div className={styles.infoList}>
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>İlgili Sipariş:</span>
                    <span className={styles.infoValue}>
                      {selectedNotification.orderNumber ? (
                        <Link href={`/admin/orders/${selectedNotification.orderNumber}`} style={{ color: 'var(--zuu-blue)' }}>
                          #{selectedNotification.orderNumber}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </span>
                  </div>
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Alıcı Adresi:</span>
                    <span className={styles.infoValue} style={{ fontWeight: 600 }}>
                      {selectedNotification.recipient}
                    </span>
                  </div>
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Konu Başlığı:</span>
                    <span className={styles.infoValue}>{selectedNotification.subject}</span>
                  </div>
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Olay Tipi (Event):</span>
                    <span className={styles.infoValue} style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                      {selectedNotification.type}
                    </span>
                  </div>
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Kanal & Sağlayıcı:</span>
                    <span className={styles.infoValue}>
                      {selectedNotification.channel} · {selectedNotification.provider}
                    </span>
                  </div>
                  {selectedNotification.providerMessageId && (
                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>Sağlayıcı Mesaj ID:</span>
                      <span className={styles.infoValue} style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}>
                        {selectedNotification.providerMessageId}
                      </span>
                    </div>
                  )}
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Oluşturulma:</span>
                    <span className={styles.infoValue}>
                      {new Date(selectedNotification.createdAt).toLocaleString('tr-TR')}
                    </span>
                  </div>
                  {selectedNotification.sentAt && (
                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>Gönderilme:</span>
                      <span className={styles.infoValue}>
                        {new Date(selectedNotification.sentAt).toLocaleString('tr-TR')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setSelectedNotification(null)}
                className={`${styles.btn} ${styles.btnSecondary}`}
              >
                Kapat
              </button>
              {selectedNotification.status === 'FAILED' && (
                <button
                  type="button"
                  disabled={retryingId === selectedNotification.id}
                  onClick={() => handleRetryNotification(selectedNotification.id)}
                  className={`${styles.btn} ${styles.btnDanger}`}
                >
                  {retryingId === selectedNotification.id ? 'Deneniyor...' : 'Şimdi Yeniden Gönder'}
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
