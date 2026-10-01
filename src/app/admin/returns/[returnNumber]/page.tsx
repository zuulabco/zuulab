'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import Modal from '@/components/common/Modal'
import { getReturnStatusConfig } from '@/lib/constants/admin-status'
import styles from '../../admin.module.css'

export default function AdminReturnDetailPage() {
  const params = useParams()
  const returnNumber = params.returnNumber as string
  const { token } = useAuthStore()
  const { addToast } = useToastStore()

  const [returnReq, setReturnReq] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Inspection form states
  const [itemInspections, setItemInspections] = useState<{
    [orderItemId: string]: {
      condition: string
      inspectionResult: string
      resolution: string
      notes: string
    }
  }>({})

  // Admin note / reject reason
  const [adminNote, setAdminNote] = useState('')
  const [shippingProvider, setShippingProvider] = useState<'SURAT' | 'YURTICI'>('SURAT')
  const [replacementProductId, setReplacementProductId] = useState('')

  // Modal states for destructive & state-changing operations
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false)
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false)
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false)

  const fetchDetail = async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/returns/${returnNumber}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success && data.returnRequest) {
        setReturnReq(data.returnRequest)
        // init inspection map
        const initialMap: any = {}
        data.returnRequest.items?.forEach((it: any) => {
          initialMap[it.orderItemId] = {
            condition: it.condition || 'USED',
            inspectionResult: it.inspectionResult || 'PASSED',
            resolution: it.resolution || 'RESTOCK',
            notes: '',
          }
        })
        setItemInspections(initialMap)
      } else {
        setError(data.error || 'İade detayı yüklenemedi.')
      }
    } catch {
      setError('Bağlantı hatası oluştu.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDetail()
  }, [returnNumber, token])

  const handleAction = async (endpoint: string, bodyData: any = {}) => {
    if (!token) return
    setActionLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/returns/${returnNumber}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(bodyData),
      })
      const data = await res.json()
      if (data.success) {
        addToast(data.message || 'İade işlemi başarıyla tamamlandı.', 'success')
        setIsApproveModalOpen(false)
        setIsRejectModalOpen(false)
        setIsRefundModalOpen(false)
        fetchDetail()
      } else {
        addToast(data.error || 'İşlem gerçekleştirilemedi.', 'error')
      }
    } catch {
      addToast('İşlem sırasında bağlantı hatası oluştu.', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleInspectSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const itemsPayload = Object.entries(itemInspections).map(([orderItemId, vals]) => ({
      orderItemId,
      condition: vals.condition,
      inspectionResult: vals.inspectionResult,
      resolution: vals.resolution,
      notes: vals.notes,
    }))

    handleAction('inspect', {
      adminNote,
      items: itemsPayload,
    })
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
          İade talebi yükleniyor...
        </div>
      </div>
    )
  }

  if (!returnReq) {
    return (
      <div className={styles.page}>
        <div style={{ padding: '40px 0', textAlign: 'center' }}>
          <p style={{ color: 'var(--danger)', marginBottom: 16 }}>{error || 'Talep bulunamadı.'}</p>
          <Link href="/admin/returns" className={styles.secondaryBtn}>
            &larr; İade Listesine Dön
          </Link>
        </div>
      </div>
    )
  }

  const statusCfg = getReturnStatusConfig(returnReq.status)

  return (
    <div className={styles.page}>
      {/* Top Header */}
      <div className={styles.header}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Link href="/admin/returns" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: 13 }}>
              &larr; İadeler
            </Link>
            <span style={{ color: 'var(--border)' }}>/</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-muted)' }}>
              #{returnReq.returnNumber}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 className={styles.title} style={{ fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>
              #{returnReq.returnNumber}
            </h1>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 4,
                background: returnReq.type === 'EXCHANGE' ? 'var(--zuu-blue-light, #e0f2fe)' : 'var(--surface-2)',
                color: returnReq.type === 'EXCHANGE' ? 'var(--zuu-blue, #0284c7)' : 'var(--text-secondary)',
              }}
            >
              {returnReq.type === 'EXCHANGE' ? 'Ürün Değişimi' : 'Para İadesi'}
            </span>
            <span className={`${styles.badge} ${statusCfg.badgeClass}`}>
              {statusCfg.label}
            </span>
          </div>

          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8, display: 'flex', gap: 16 }}>
            <span>
              Sipariş:{' '}
              <Link
                href={`/admin/orders/${returnReq.orderNumber}`}
                style={{ color: 'var(--zuu-blue)', textDecoration: 'none', fontWeight: 600, fontFamily: 'var(--font-mono)' }}
              >
                #{returnReq.orderNumber}
              </Link>
            </span>
            <span>·</span>
            <span>Talep Tarihi: {new Date(returnReq.requestedAt).toLocaleString('tr-TR')}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => fetchDetail()}
            disabled={loading}
          >
            Yenile
          </button>
        </div>
      </div>

      {/* Main Grid: Left Details, Right Workflow Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 24, alignItems: 'start' }}>
        {/* Left Column: Details & Inspection */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Customer & Reason Info */}
          <div className={styles.cardPanel}>
            <div className={styles.panelHeader}>
              <span className={styles.panelTitle}>Müşteri & Talep Detayı</span>
              {returnReq.userId && (
                <Link
                  href={`/admin/customers/${returnReq.userId}`}
                  style={{ fontSize: 12, color: 'var(--zuu-blue)', textDecoration: 'none', fontWeight: 500 }}
                >
                  Müşteri 360° &rarr;
                </Link>
              )}
            </div>
            <div className={styles.panelBody}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Müşteri
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                    {returnReq.user?.fullName || 'Misafir Kullanıcı'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {returnReq.user?.email || '—'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    İade / Değişim Gerekçesi
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                    {returnReq.reason}
                  </div>
                </div>
              </div>

              {returnReq.customerNote && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                    Müşteri Açıklaması
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, background: 'var(--surface-1)', padding: '10px 14px', borderRadius: 4 }}>
                    {returnReq.customerNote}
                  </div>
                </div>
              )}

              {returnReq.photoUrls && returnReq.photoUrls.length > 0 && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                    Eklenen Görseller / Kanıt
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {returnReq.photoUrls.map((url: string, i: number) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.ghostBtn}
                        style={{ fontSize: 12, padding: '4px 10px', textDecoration: 'none' }}
                      >
                        Kanıt Görseli #{i + 1} ↗
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Return Items & Inspection Card */}
          <div className={styles.cardPanel}>
            <div className={styles.panelHeader}>
              <span className={styles.panelTitle}>İşlem Yapılan Ürünler & Ekspertiz Durumu</span>
            </div>
            <div className={styles.panelBody} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {returnReq.items?.map((item: any) => {
                const inspection = itemInspections[item.orderItemId] || {
                  condition: 'USED',
                  inspectionResult: 'PASSED',
                  resolution: 'RESTOCK',
                  notes: '',
                }

                return (
                  <div
                    key={item.id || item.orderItemId}
                    style={{
                      background: 'var(--surface-1)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: 16,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                          {item.productName || `Ürün (ID: ${item.orderItemId})`}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                          Talep Adedi: <strong style={{ color: 'var(--text-primary)' }}>{item.quantity}</strong> · Gerekçe: {item.reason || returnReq.reason}
                        </div>
                      </div>
                      <div>
                        {item.restocked ? (
                          <span className={styles.badge} style={{ background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' }}>
                            Stoğa Eklendi
                          </span>
                        ) : item.resolution === 'NOT_RESTOCKABLE' ? (
                          <span className={styles.badge} style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' }}>
                            Stok Dışı Bırakıldı
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Inspection Controls if in RECEIVED or INSPECTED or approved state */}
                    {['RECEIVED', 'INSPECTED', 'APPROVED'].includes(returnReq.status) && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 500 }}>
                            Fiziki Durum
                          </label>
                          <select
                            value={inspection.condition}
                            onChange={(e) =>
                              setItemInspections((prev) => ({
                                ...prev,
                                [item.orderItemId]: { ...prev[item.orderItemId], condition: e.target.value },
                              }))
                            }
                            className={styles.searchBox}
                            style={{ width: '100%', fontSize: 12, padding: '6px 8px' }}
                          >
                            <option value="UNOPENED">Kutusunda / Sıfır</option>
                            <option value="USED">Kullanılmış / Açılmış</option>
                            <option value="DAMAGED">Hasarlı</option>
                            <option value="DEFECTIVE">Kusurlu / Bozuk</option>
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 500 }}>
                            Ekspertiz Sonucu
                          </label>
                          <select
                            value={inspection.inspectionResult}
                            onChange={(e) =>
                              setItemInspections((prev) => ({
                                ...prev,
                                [item.orderItemId]: { ...prev[item.orderItemId], inspectionResult: e.target.value },
                              }))
                            }
                            className={styles.searchBox}
                            style={{ width: '100%', fontSize: 12, padding: '6px 8px' }}
                          >
                            <option value="PASSED">Geçti (Kabul)</option>
                            <option value="FAILED">Kusurlu / Red</option>
                            <option value="SCRAP">Hurda / İmha</option>
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 500 }}>
                            Stok Kararı
                          </label>
                          <select
                            value={inspection.resolution}
                            onChange={(e) =>
                              setItemInspections((prev) => ({
                                ...prev,
                                [item.orderItemId]: { ...prev[item.orderItemId], resolution: e.target.value },
                              }))
                            }
                            className={styles.searchBox}
                            style={{ width: '100%', fontSize: 12, padding: '6px 8px' }}
                          >
                            <option value="RESTOCK">Stoğa Geri Al (Restock)</option>
                            <option value="NOT_RESTOCKABLE">Stok Artırma (Kullanılamaz)</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {['RECEIVED', 'INSPECTED'].includes(returnReq.status) && (
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={handleInspectSubmit}
                    className={styles.primaryBtn}
                    style={{ fontSize: 12 }}
                  >
                    {actionLoading ? 'Kaydediliyor...' : 'Ekspertizi Tamamla & Stok Kararını Uygula'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Reverse Logistics Shipment Card */}
          <div className={styles.cardPanel}>
            <div className={styles.panelHeader}>
              <span className={styles.panelTitle}>Tersine Lojistik & Kargo Bilgisi</span>
            </div>
            <div className={styles.panelBody}>
              {returnReq.shipment ? (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Kargo Firması:</span>
                    <strong style={{ color: 'var(--text-primary)' }}>
                      {returnReq.shipment.provider === 'SURAT' ? 'Sürat Kargo' : returnReq.shipment.provider === 'YURTICI' ? 'Yurtiçi Kargo' : returnReq.shipment.provider}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Takip Kodu:</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {returnReq.shipment.trackingNumber}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Kargo Durumu:</span>
                    <span className={styles.badge}>{returnReq.shipment.status}</span>
                  </div>
                  {returnReq.shipment.trackingUrl && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
                      <a
                        href={returnReq.shipment.trackingUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: 'var(--zuu-blue)', textDecoration: 'none', fontWeight: 500, fontSize: 12 }}
                      >
                        Kargo Takip Ekranını Aç &rarr;
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
                  Henüz iade kargo kaydı veya takip kodu oluşturulmadı.
                </div>
              )}
            </div>
          </div>

          {/* Events Timeline */}
          {returnReq.events && returnReq.events.length > 0 && (
            <div className={styles.cardPanel}>
              <div className={styles.panelHeader}>
                <span className={styles.panelTitle}>Süreç Olay Günlüğü</span>
              </div>
              <div className={styles.panelBody} style={{ padding: 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {returnReq.events.map((ev: any, idx: number) => (
                    <div
                      key={ev.id || idx}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: 12,
                        padding: '10px 16px',
                        borderBottom: idx === returnReq.events.length - 1 ? 'none' : '1px solid var(--border-subtle)',
                      }}
                    >
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500, fontFamily: 'var(--font-mono)' }}>
                        {ev.type}
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {new Date(ev.createdAt).toLocaleString('tr-TR')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Workflow Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className={styles.cardPanel}>
            <div className={styles.panelHeader}>
              <span className={styles.panelTitle}>Operasyonel Kararlar</span>
            </div>
            <div className={styles.panelBody} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Note input */}
              <div>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 500 }}>
                  Yönetici Notu
                </label>
                <textarea
                  rows={2}
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="İşlem notu veya gerekçe girin..."
                  className={styles.searchBox}
                  style={{ width: '100%', fontSize: 12, padding: '8px 10px', resize: 'vertical' }}
                />
              </div>

              {/* Action Buttons based on status */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Approve Action */}
                {['REQUESTED', 'UNDER_REVIEW'].includes(returnReq.status) && (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => setIsApproveModalOpen(true)}
                    className={`${styles.btn} ${styles.btnPrimary}`}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    Talebi Onayla
                  </button>
                )}

                {/* Reject Action */}
                {['REQUESTED', 'UNDER_REVIEW'].includes(returnReq.status) && (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => setIsRejectModalOpen(true)}
                    className={`${styles.btn} ${styles.btnSecondary}`}
                    style={{ width: '100%', justifyContent: 'center', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                  >
                    Talebi Reddet
                  </button>
                )}

                {/* Create Return Shipment Action */}
                {['APPROVED'].includes(returnReq.status) && (
                  <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 500 }}>
                      İade Kargo Taşıyıcısı
                    </label>
                    <select
                      value={shippingProvider}
                      onChange={(e) => setShippingProvider(e.target.value as any)}
                      className={styles.searchBox}
                      style={{ width: '100%', fontSize: 12, marginBottom: 8 }}
                    >
                      <option value="SURAT">Sürat Kargo (Tersine Lojistik)</option>
                      <option value="YURTICI">Yurtiçi Kargo</option>
                    </select>
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => handleAction('shipping', { provider: shippingProvider })}
                      className={styles.primaryBtn}
                      style={{ width: '100%', justifyContent: 'center' }}
                    >
                      İade Kargo Kodunu Üret
                    </button>
                  </div>
                )}

                {/* Receive at Warehouse Action */}
                {['RETURN_SHIPPING_CREATED', 'IN_TRANSIT'].includes(returnReq.status) && (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleAction('receive', { adminNote })}
                    className={styles.primaryBtn}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    Depoya Teslim Alındı Olarak İşle
                  </button>
                )}

                {/* Final Refund Action */}
                {returnReq.type === 'RETURN' && ['INSPECTED', 'REFUND_PENDING'].includes(returnReq.status) && (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => setIsRefundModalOpen(true)}
                    className={styles.primaryBtn}
                    style={{ width: '100%', justifyContent: 'center', background: '#059669', borderColor: '#059669', color: '#fff' }}
                  >
                    Para İadesini Onayla & Tamamla
                  </button>
                )}

                {/* Final Exchange Action */}
                {returnReq.type === 'EXCHANGE' && ['INSPECTED', 'EXCHANGE_PENDING'].includes(returnReq.status) && (
                  <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
                    <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 500 }}>
                      Değişim Ürün ID (Opsiyonel)
                    </label>
                    <input
                      type="text"
                      value={replacementProductId}
                      onChange={(e) => setReplacementProductId(e.target.value)}
                      placeholder="Yeni Ürün ID..."
                      className={styles.searchBox}
                      style={{ width: '100%', fontSize: 12, marginBottom: 8 }}
                    />
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => handleAction('exchange', { replacementProductId: replacementProductId || undefined, replacementQuantity: 1 })}
                      className={styles.primaryBtn}
                      style={{ width: '100%', justifyContent: 'center' }}
                    >
                      Değişim Sevkini Başlat
                    </button>
                  </div>
                )}

                {['COMPLETED'].includes(returnReq.status) && (
                  <div style={{ padding: '12px', background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: 6, color: '#166534', fontSize: 12, textAlign: 'center', fontWeight: 500 }}>
                    Bu talep başarıyla sonuçlandırılmıştır.
                  </div>
                )}

                {['REJECTED'].includes(returnReq.status) && (
                  <div style={{ padding: '12px', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', fontSize: 12, textAlign: 'center', fontWeight: 500 }}>
                    Bu talep reddedilmiştir.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal: Approve Return */}
      <Modal
        isOpen={isApproveModalOpen}
        onClose={() => setIsApproveModalOpen(false)}
        ariaLabel="İade Talebini Onayla"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            İade Talebini Onayla
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
            <strong>#{returnReq.returnNumber}</strong> numaralı iade talebini onaylamak üzeresiniz.
            Bu işlem müşteriye iade onay bildirimi gönderecek ve kargo sevk sürecini başlatacaktır.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => setIsApproveModalOpen(false)}
              disabled={actionLoading}
            >
              Vazgeç
            </button>
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={actionLoading}
              onClick={() => handleAction('approve', { adminNote })}
            >
              {actionLoading ? 'Onaylanıyor...' : 'İadeyi Onayla'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirmation Modal: Reject Return */}
      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => setIsRejectModalOpen(false)}
        ariaLabel="İade Talebini Reddet"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            İade Talebini Reddet
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
            İade talebini reddetmek istediğinize emin misiniz? Lütfen müşteriye iletilecek ret gerekçesini belirtin.
          </p>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-primary)', marginBottom: 4, fontWeight: 500 }}>
              Ret Gerekçesi (Zorunlu)
            </label>
            <textarea
              rows={3}
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              placeholder="Ret nedeni..."
              className={styles.searchBox}
              style={{ width: '100%', fontSize: 12, padding: '8px 10px' }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => setIsRejectModalOpen(false)}
              disabled={actionLoading}
            >
              Vazgeç
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
              disabled={actionLoading || !adminNote.trim()}
              onClick={() => handleAction('reject', { adminNote })}
            >
              {actionLoading ? 'İşleniyor...' : 'Talebi Reddet'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirmation Modal: Process Refund */}
      <Modal
        isOpen={isRefundModalOpen}
        onClose={() => setIsRefundModalOpen(false)}
        ariaLabel="Geri Ödemeyi Onayla ve Tamamla"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            Geri Ödemeyi Onayla ve Tamamla
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
            Bu işlem ilgili ödeme sağlayıcısı veya iade bakiyesi üzerinden tutarın müşteriye aktarılmasını onaylar ve talebi <strong>TAMAMLANDI (COMPLETED)</strong> statüsüne alır.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => setIsRefundModalOpen(false)}
              disabled={actionLoading}
            >
              Vazgeç
            </button>
            <button
              type="button"
              className={styles.primaryBtn}
              style={{ background: '#059669', borderColor: '#059669', color: '#fff' }}
              disabled={actionLoading}
              onClick={() => handleAction('refund')}
            >
              {actionLoading ? 'İade Ediliyor...' : 'Geri Ödemeyi Onayla'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
