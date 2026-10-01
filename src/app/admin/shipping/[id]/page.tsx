'use client'

import React, { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import Modal from '@/components/common/Modal'
import { SHIPMENT_STATUS_MAP } from '@/lib/constants/admin-status'
import styles from '../../admin.module.css'

interface ShipmentDetail {
  id: string
  orderId: string | null
  orderNumber: string | null
  marketplaceOrderId: string | null
  marketplaceOrderNumber: string | null
  channel: 'DIRECT' | 'MARKETPLACE'
  storeId: string | null
  provider: string
  carrier: string
  externalShipmentId: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  status: string
  serviceType: string
  recipientName: string
  recipientPhone: string
  shippingAddress: {
    fullName?: string
    phone?: string
    addressLine?: string
    city?: string
    district?: string
    postalCode?: string
    country?: string
  }
  packageCount: number
  totalWeightKg: number | null
  notes: string | null
  currentLabelId: string | null
  shippedAt: string | null
  deliveredAt: string | null
  cancelledAt: string | null
  createdAt: string
  updatedAt: string
}

interface LabelRecord {
  labelId: string
  shipmentId: string
  version: number
  format: string
  status: string
  storageKey: string
  mimeType: string
  widthMm: number
  heightMm: number
  barcodePayload: string
  checksum: string
  data: string
  createdAt: string
}

interface EventRecord {
  id: string
  eventType: string
  previousStatus: string | null
  newStatus: string
  description: string
  location: string | null
  occurredAt: string
  payload?: any
}

interface QueueJobRecord {
  id: string
  jobType: string
  status: string
  attempts: number
  maxAttempts: number
  nextRetryAt: string | null
  lastError: string | null
  createdAt: string
}

export default function ShippingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const resolvedParams = use(params)
  const { id } = resolvedParams
  const { token, canFetch } = useAuthStore()
  const { addToast } = useToastStore()

  const [shipment, setShipment] = useState<ShipmentDetail | null>(null)
  const [labels, setLabels] = useState<LabelRecord[]>([])
  const [events, setEvents] = useState<EventRecord[]>([])
  const [queueJobs, setQueueJobs] = useState<QueueJobRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [selectedFormat, setSelectedFormat] = useState<'PDF' | 'ZPL' | 'PNG'>('PDF')
  const [showCancelModal, setShowCancelModal] = useState(false)

  const fetchDetail = async () => {
    if (!canFetch) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/shipping/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        setShipment(data.shipment)
        setLabels(data.labels || [])
        setEvents(data.events || [])
        setQueueJobs(data.queueJobs || [])
      } else {
        setError(data.error || 'Kargo detayı yüklenemedi.')
      }
    } catch {
      setError('Sunucu bağlantı hatası oluştu.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDetail()
  }, [id, token, canFetch])

  const handleCreateLabel = async (regenerate = false) => {
    if (!canFetch) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/admin/shipping/${id}/label`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ format: selectedFormat, regenerate }),
      })
      const data = await res.json()
      if (data.success) {
        addToast(regenerate ? 'Etiket yeni versiyonla yeniden oluşturuldu.' : 'Kargo etiketi oluşturuldu.', 'success')
        fetchDetail()
      } else {
        addToast(data.error || 'Etiket işlemi başarısız.', 'error')
      }
    } catch {
      addToast('Etiket servisine ulaşılamadı.', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleSyncTracking = async () => {
    if (!canFetch) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/admin/shipping/${id}/tracking`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        addToast('Kargo takip durumu güncellendi.', 'success')
        fetchDetail()
      } else {
        addToast(data.error || 'Takip senkronizasyonu başarısız.', 'error')
      }
    } catch {
      addToast('Kargo firması servisine bağlanırken hata oluştu.', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const executeCancelShipment = async () => {
    if (!canFetch) return
    setShowCancelModal(false)
    setActionLoading(true)
    try {
      const res = await fetch(`/api/admin/shipping/${id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: 'Yönetici paneli üzerinden manuel iptal' }),
      })
      const data = await res.json()
      if (data.success) {
        addToast('Kargo gönderisi iptal edildi.', 'success')
        fetchDetail()
      } else {
        addToast(data.error || 'İptal işlemi başarısız.', 'error')
      }
    } catch {
      addToast('İptal işlemi sırasında hata oluştu.', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleRetry = async () => {
    if (!canFetch) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/admin/shipping/${id}/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        addToast('Kargo işlemi yeniden deneme kuyruğuna alındı.', 'success')
        fetchDetail()
      } else {
        addToast(data.error || 'Yeniden deneme başlatılamadı.', 'error')
      }
    } catch {
      addToast('Kuyruk servisiyle bağlantı kurulamadı.', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const downloadLabelData = (label: LabelRecord) => {
    if (label.format === 'PDF') {
      const blob = new Blob([Buffer.from(label.data, 'base64')], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `etiket-${shipment?.trackingNumber || id}-v${label.version}.pdf`
      a.click()
      addToast('PDF etiketi indirildi.', 'success')
    } else if (label.format === 'ZPL') {
      const blob = new Blob([label.data], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `etiket-${shipment?.trackingNumber || id}-v${label.version}.zpl`
      a.click()
      addToast('ZPL termal barkod dosyası indirildi.', 'success')
    } else {
      const a = document.createElement('a')
      a.href = label.data
      a.download = `etiket-${shipment?.trackingNumber || id}-v${label.version}.${label.format.toLowerCase()}`
      a.click()
    }
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Kargo detayları yükleniyor...
        </div>
      </div>
    )
  }

  if (error && !shipment) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <Link href="/admin/shipping" className={styles.secondaryButton}>
            ← Kargo Listesine Dön
          </Link>
        </div>
        <div style={{ padding: '16px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 'var(--radius-sm)' }}>
          {error}
        </div>
      </div>
    )
  }

  const latestLabel = labels.sort((a, b) => b.version - a.version)[0]
  const statusMeta = SHIPMENT_STATUS_MAP[shipment?.status || ''] || {
    label: shipment?.status || 'Bilinmiyor',
    badgeClass: styles.badgeNeutral,
  }

  return (
    <div className={styles.container}>
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <Link href="/admin/shipping" className={styles.secondaryButton} style={{ padding: '4px 10px', fontSize: '12px' }}>
              ← Kargo Listesi
            </Link>
            <h1 className={styles.title} style={{ margin: 0, fontFamily: 'var(--font-mono)' }}>
              Kargo #{shipment?.trackingNumber || id.slice(-8)}
            </h1>
            <span className={`${styles.badge} ${statusMeta.badgeClass}`}>
              {statusMeta.label}
            </span>
          </div>
          <p className={styles.subtitle} style={{ marginTop: '6px' }}>
            {shipment?.carrier} · Kanal: {shipment?.channel === 'MARKETPLACE' ? 'Pazaryeri' : 'Doğrudan ZUULAB'} · Oluşturulma:{' '}
            {shipment?.createdAt ? new Date(shipment.createdAt).toLocaleString('tr-TR') : '-'}
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={handleSyncTracking}
            disabled={actionLoading}
            className={styles.secondaryButton}
          >
            {actionLoading ? 'Güncelleniyor...' : 'Takip Senkronize Et'}
          </button>
          {shipment?.status !== 'CANCELLED' && shipment?.status !== 'DELIVERED' && (
            <button
              onClick={() => setShowCancelModal(true)}
              disabled={actionLoading}
              className={styles.secondaryButton}
              style={{ color: '#dc2626', borderColor: '#fca5a5' }}
            >
              Kargoyu İptal Et
            </button>
          )}
          {shipment?.status === 'FAILED' && (
            <button
              onClick={handleRetry}
              disabled={actionLoading}
              className={styles.primaryButton}
            >
              Tekrar Dene
            </button>
          )}
        </div>
      </div>

      {/* ── 2-COLUMN OPERATIONAL LAYOUT ────────────────────────────────────── */}
      <div className={styles.detailGrid}>
        {/* LEFT COLUMN: Operational Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Order & Recipient Information */}
          <div className={styles.orderSummaryBox}>
            <div className={styles.summaryTitle}>Sipariş ve Alıcı Bilgileri</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', fontSize: '13px' }}>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', marginBottom: '4px' }}>Sipariş</div>
                {shipment?.orderNumber ? (
                  <Link href={`/admin/orders/${shipment.orderNumber}`} style={{ color: 'var(--brand-blue, #0080c4)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                    #{shipment.orderNumber} ↗
                  </Link>
                ) : (
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{shipment?.marketplaceOrderNumber || '-'}</span>
                )}
                <div style={{ marginTop: '8px', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Kanal & Paket</div>
                <div>{shipment?.channel === 'MARKETPLACE' ? 'Pazaryeri Siparişi' : 'ZUULAB Doğrudan Satış'}</div>
                <div style={{ color: 'var(--text-secondary)' }}>{shipment?.packageCount || 1} Koli {shipment?.totalWeightKg ? `· ${shipment.totalWeightKg} kg` : ''}</div>
              </div>

              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', marginBottom: '4px' }}>Alıcı Müşteri</div>
                <div style={{ fontWeight: 600 }}>{shipment?.recipientName}</div>
                <div style={{ color: 'var(--text-secondary)' }}>{shipment?.recipientPhone || '-'}</div>
                <div style={{ marginTop: '8px', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Teslimat Adresi</div>
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {shipment?.shippingAddress?.addressLine}<br />
                  {shipment?.shippingAddress?.district} / {shipment?.shippingAddress?.city} {shipment?.shippingAddress?.postalCode || ''}
                </div>
              </div>
            </div>
          </div>

          {/* Label Management Section */}
          <div className={styles.orderSummaryBox}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <div className={styles.summaryTitle} style={{ margin: 0 }}>Kargo Etiketi (100×100 mm Xprinter)</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Güncel Versiyon: {latestLabel ? `v${latestLabel.version}` : 'Henüz Yok'} · Format: {latestLabel?.format || 'PDF'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <select
                  value={selectedFormat}
                  onChange={(e) => setSelectedFormat(e.target.value as any)}
                  className={styles.select}
                  style={{ width: '80px', padding: '4px 8px', fontSize: '12px' }}
                >
                  <option value="PDF">PDF</option>
                  <option value="ZPL">ZPL</option>
                  <option value="PNG">PNG</option>
                </select>
                <button
                  onClick={() => handleCreateLabel(false)}
                  disabled={actionLoading}
                  className={styles.secondaryButton}
                  style={{ padding: '4px 10px', fontSize: '12px' }}
                >
                  Etiket Al
                </button>
                <button
                  onClick={() => handleCreateLabel(true)}
                  disabled={actionLoading}
                  className={styles.primaryButton}
                  style={{ padding: '4px 10px', fontSize: '12px' }}
                >
                  Yeniden Oluştur (v+)
                </button>
              </div>
            </div>

            {labels.length > 0 ? (
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Versiyon</th>
                      <th>Format</th>
                      <th>Boyut</th>
                      <th>Barkod Verisi</th>
                      <th>Tarih</th>
                      <th style={{ textAlign: 'right' }}>İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {labels.map((l) => (
                      <tr key={l.labelId}>
                        <td style={{ fontWeight: 600 }}>
                          v{l.version} {l.version === latestLabel?.version && <span style={{ color: '#16a34a', fontSize: '11px' }}>(Güncel)</span>}
                        </td>
                        <td>{l.format}</td>
                        <td>{l.widthMm}×{l.heightMm} mm</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{l.barcodePayload}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{new Date(l.createdAt).toLocaleString('tr-TR')}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            onClick={() => downloadLabelData(l)}
                            className={styles.secondaryButton}
                            style={{ padding: '3px 8px', fontSize: '11px' }}
                          >
                            İndir ({l.format})
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                Bu gönderi için henüz oluşturulmuş bir termal kargo etiketi bulunmuyor.
              </div>
            )}
          </div>

          {/* Timeline Events */}
          <div className={styles.orderSummaryBox}>
            <div className={styles.summaryTitle}>Lojistik Olay Geçmişi (Timeline)</div>
            {events.length > 0 ? (
              <div className={styles.timeline}>
                {events.map((ev) => (
                  <div key={ev.id} className={styles.timelineItem}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{ev.eventType}</span>
                      <span>{new Date(ev.occurredAt).toLocaleString('tr-TR')}</span>
                    </div>
                    <div style={{ fontSize: '13px', marginTop: '4px', color: 'var(--text-secondary)' }}>{ev.description}</div>
                    {ev.location && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Konum: {ev.location}</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Henüz kaydedilmiş bir lojistik olayı bulunmuyor.</div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Carrier Summary & Diagnostics */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Carrier & Tracking */}
          <div className={styles.orderSummaryBox}>
            <div className={styles.summaryTitle}>Taşıyıcı & Takip Özeti</div>
            <div className={styles.summaryRow}>
              <span>Taşıyıcı Firma:</span>
              <strong>{shipment?.carrier} ({shipment?.provider})</strong>
            </div>
            <div className={styles.summaryRow}>
              <span>Takip Numarası:</span>
              <strong style={{ fontFamily: 'var(--font-mono)' }}>
                {shipment?.trackingUrl ? (
                  <a href={shipment.trackingUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--brand-blue, #0080c4)' }}>
                    {shipment.trackingNumber} ↗
                  </a>
                ) : (
                  shipment?.trackingNumber || '-'
                )}
              </strong>
            </div>
            <div className={styles.summaryRow}>
              <span>Harici Referans:</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{shipment?.externalShipmentId || '-'}</span>
            </div>
            <div className={styles.summaryRow}>
              <span>Servis Türü:</span>
              <span>{shipment?.serviceType || 'STANDART'}</span>
            </div>
            <div className={styles.summaryRow}>
              <span>Kargoya Verilme:</span>
              <span>{shipment?.shippedAt ? new Date(shipment.shippedAt).toLocaleString('tr-TR') : 'Henüz verilmedi'}</span>
            </div>
            <div className={styles.summaryRow}>
              <span>Teslim Edilme:</span>
              <span>{shipment?.deliveredAt ? new Date(shipment.deliveredAt).toLocaleString('tr-TR') : '-'}</span>
            </div>
          </div>

          {/* Technical Diagnostics */}
          <div className={styles.orderSummaryBox}>
            <div className={styles.summaryTitle}>Teknik Teşhis & Kuyruk Durumu</div>
            <div className={styles.summaryRow}>
              <span>Sağlayıcı Kodu:</span>
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{shipment?.provider}</code>
            </div>
            <div className={styles.summaryRow}>
              <span>Durum Kodu:</span>
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{shipment?.status}</code>
            </div>

            <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>Arka Plan Kuyruk Görevleri</div>
              {queueJobs.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {queueJobs.map((j) => (
                    <div
                      key={j.id}
                      style={{
                        padding: '8px 10px',
                        fontSize: '12px',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--surface-1)',
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <strong>{j.jobType}</strong> · Deneme: {j.attempts}/{j.maxAttempts}
                      </div>
                      <span style={{ fontWeight: 600, color: j.status === 'COMPLETED' ? '#16a34a' : j.status === 'FAILED' ? '#dc2626' : '#d97706' }}>
                        {j.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Aktif veya geçmiş kuyruk görevi yok.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── CANCEL SHIPMENT MODAL ────────────────────────────────────────────── */}
      <Modal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        ariaLabel="Kargo Gönderisi İptal Onayı"
        maxWidth={480}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            Kargo Gönderisi İptal Onayı
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
            <strong>#{shipment?.trackingNumber || id}</strong> numaralı kargo gönderisini iptal etmek istediğinize emin misiniz?
          </p>
          <div
            style={{
              padding: '12px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 'var(--radius-sm)',
              fontSize: '12px',
              color: '#991b1b',
            }}
          >
            Bu işlem kargo firması API&apos;sine iptal bildirimi gönderecek ve varsa oluşturulmuş barkodu geçersiz kılacaktır.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={() => setShowCancelModal(false)}
              className={styles.secondaryButton}
            >
              Vazgeç
            </button>
            <button
              type="button"
              disabled={actionLoading}
              onClick={executeCancelShipment}
              className={styles.primaryButton}
              style={{ background: '#dc2626', borderColor: '#b91c1c' }}
            >
              {actionLoading ? 'İptal Ediliyor...' : 'Evet, Gönderiyi İptal Et'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
