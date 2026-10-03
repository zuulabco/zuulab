'use client'

import React, { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import Modal from '@/components/common/Modal'
import { SHIPMENT_STATUS_MAP } from '@/lib/constants/admin-status'
import styles from '../admin.module.css'
import { SkeletonRows } from '@/components/common/Skeleton'

interface StoredShipmentItem {
  id: string
  orderId?: string | null
  orderNumber?: string | null
  marketplaceOrderId?: string | null
  marketplaceOrderNumber?: string | null
  channel?: 'DIRECT' | 'MARKETPLACE'
  storeId?: string | null
  provider: string
  carrier?: string
  externalShipmentId?: string | null
  trackingNumber: string
  trackingUrl: string
  status: string
  recipientName: string
  recipientPhone?: string
  packageCount: number
  totalWeightKg?: number | null
  currentLabelId?: string | null
  shippedAt?: string | null
  deliveredAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface CarrierEnvironmentStatus {
  suratConfigured: boolean
  pttConfigured?: boolean
  yurticiConfigured: boolean
}

export interface CarrierSettings {
  outboundCarrier: string
  returnCarrier: string
  availableCarriers?: Array<{ id: string; name: string; isConfigured: boolean }>
  envStatus?: CarrierEnvironmentStatus
}

export interface ShippingStats {
  kargoyaHazir: number
  etiketHazir: number
  etiketBekliyor: number
  kargoyaVerildi: number
  todayTotal: number
}

interface OperationReport {
  type: 'LABEL' | 'SHIP'
  title: string
  successCount: number
  failedCount: number
  failures: Array<{ shipmentId: string; orderNumber: string | null; error: string }>
}

export default function AdminShippingPage() {
  const { token, canFetch } = useAuthStore()
  const { addToast } = useToastStore()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [shipments, setShipments] = useState<StoredShipmentItem[]>([])
  const [stats, setStats] = useState<ShippingStats>({
    kargoyaHazir: 0,
    etiketHazir: 0,
    etiketBekliyor: 0,
    kargoyaVerildi: 0,
    todayTotal: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [quickFilter, setQuickFilter] = useState<string>(
    searchParams.get('quickFilter') || searchParams.get('status') || 'ALL'
  )
  const [channelFilter, setChannelFilter] = useState<string>('')
  const [providerFilter, setProviderFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>(searchParams.get('search') || '')

  // Selection & Bulk actions
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkProcessing, setBulkProcessing] = useState(false)
  const [bulkActionType, setBulkActionType] = useState<string | null>(null)
  const [operationReport, setOperationReport] = useState<OperationReport | null>(null)

  // Modals
  const [showBulkShipModal, setShowBulkShipModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)

  // Carrier settings state
  const [, setCarrierSettings] = useState<CarrierSettings | null>(null)
  const [selectedOutbound, setSelectedOutbound] = useState('SURAT')
  const [selectedReturn, setSelectedReturn] = useState('SURAT')
  const [savingSettings, setSavingSettings] = useState(false)

  // Fetch shipments & stats
  const fetchShipments = async () => {
    if (!canFetch) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (quickFilter && quickFilter !== 'ALL') {
        params.set('quickFilter', quickFilter)
      }
      if (channelFilter) params.set('channel', channelFilter)
      if (providerFilter) params.set('provider', providerFilter)
      if (searchQuery.trim()) params.set('search', searchQuery.trim())

      const res = await fetch(`/api/admin/shipping?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        setShipments(data.shipments || [])
        if (data.stats) {
          setStats(data.stats)
        }
      } else {
        setError(data.error || 'Kargo listesi yüklenemedi.')
      }
    } catch {
      setError('Kargo verileri alınırken bağlantı hatası oluştu.')
    } finally {
      setLoading(false)
    }
  }

  // Fetch carrier settings
  const fetchCarrierSettings = async () => {
    if (!canFetch) return
    try {
      const res = await fetch('/api/admin/shipping/settings', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success && data.settings) {
        setCarrierSettings(data.settings)
        setSelectedOutbound(data.settings.outboundCarrier || 'SURAT')
        setSelectedReturn(data.settings.returnCarrier || 'SURAT')
      }
    } catch {}
  }

  useEffect(() => {
    fetchShipments()
  }, [token, canFetch, quickFilter, channelFilter, providerFilter])

  useEffect(() => {
    fetchCarrierSettings()
  }, [token, canFetch, canFetch])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    fetchShipments()
  }

  const handleQuickFilterClick = (filterKey: string) => {
    setQuickFilter(filterKey)
    setSelectedIds([])
    startTransition(() => {
      const params = new URLSearchParams(window.location.search)
      if (filterKey === 'ALL') {
        params.delete('quickFilter')
        params.delete('status')
      } else {
        params.set('quickFilter', filterKey)
      }
      router.replace(`/admin/shipping?${params.toString()}`)
    })
  }

  // Checkbox handlers
  const handleToggleSelectAll = () => {
    if (selectedIds.length === shipments.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(shipments.map((s) => s.id))
    }
  }

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  // Action: Bulk Generate Labels
  const handleBulkGenerateLabels = async () => {
    if (selectedIds.length === 0 || !canFetch) return
    setBulkProcessing(true)
    setBulkActionType('LABEL')
    setOperationReport(null)

    try {
      const res = await fetch('/api/admin/shipping/bulk-labels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ shipmentIds: selectedIds }),
      })

      const data = await res.json()
      if (data.success || data.results) {
        const successes = (data.results || []).filter((r: any) => r.success)
        const failures = (data.results || []).filter((r: any) => !r.success)

        setOperationReport({
          type: 'LABEL',
          title: 'Toplu Etiket Oluşturma Sonucu',
          successCount: successes.length,
          failedCount: failures.length,
          failures: failures.map((f: any) => ({
            shipmentId: f.shipmentId,
            orderNumber: f.orderNumber,
            error: f.error || 'Etiket üretilemedi.',
          })),
        })

        if (data.combinedPdf && data.combinedPdf.data) {
          const blob = new Blob([Buffer.from(data.combinedPdf.data, 'base64')], {
            type: 'application/pdf',
          })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = data.combinedPdf.filename || `toplu-etiketler-${Date.now()}.pdf`
          a.click()
        }

        addToast(`${successes.length} adet 100×100 mm kargo etiketi üretildi.`, 'success')
        fetchShipments()
      } else {
        addToast(data.error || 'Toplu etiket oluşturulamadı.', 'error')
      }
    } catch {
      addToast('Toplu etiket işlemi sırasında bağlantı hatası oluştu.', 'error')
    } finally {
      setBulkProcessing(false)
      setBulkActionType(null)
    }
  }

  // Action: Bulk Download PDF (existing labels)
  const handleBulkDownloadPdf = async () => {
    if (selectedIds.length === 0 || !canFetch) return
    setBulkProcessing(true)
    setBulkActionType('PDF')

    try {
      const res = await fetch('/api/admin/shipping/bulk-label', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ shipmentIds: selectedIds }),
      })

      const data = await res.json()
      if (data.success && data.data) {
        const blob = new Blob([Buffer.from(data.data, 'base64')], { type: 'application/pdf' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = data.filename || `toplu-etiket-${Date.now()}.pdf`
        a.click()
        addToast(`${data.totalPages} sayfalık 100×100 mm termal etiket indirildi.`, 'success')
      } else {
        addToast(data.error || 'Toplu etiket PDF üretilemedi.', 'error')
      }
    } catch {
      addToast('PDF indirme sırasında bağlantı hatası oluştu.', 'error')
    } finally {
      setBulkProcessing(false)
      setBulkActionType(null)
    }
  }

  // Action: Bulk Mark as Shipped (Kargoya Verildi)
  const executeBulkMarkAsShipped = async () => {
    if (selectedIds.length === 0 || !canFetch) return
    setShowBulkShipModal(false)
    setBulkProcessing(true)
    setBulkActionType('SHIP')
    setOperationReport(null)

    try {
      const res = await fetch('/api/admin/shipping/bulk-ship', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ shipmentIds: selectedIds }),
      })

      const data = await res.json()
      if (data.success || data.results) {
        const successes = (data.results || []).filter((r: any) => r.success)
        const failures = (data.results || []).filter((r: any) => !r.success)

        setOperationReport({
          type: 'SHIP',
          title: 'Toplu Sevk (Kargoya Verildi) Sonucu',
          successCount: successes.length,
          failedCount: failures.length,
          failures: failures.map((f: any) => ({
            shipmentId: f.shipmentId,
            orderNumber: f.orderNumber,
            error: f.error || 'Sevk işlemi başarısız.',
          })),
        })

        addToast(`${successes.length} gönderi kargoya verildi, stoklar düşüldü.`, 'success')
        setSelectedIds([])
        fetchShipments()
      } else {
        addToast(data.error || 'Toplu sevk işlemi başarısız oldu.', 'error')
      }
    } catch {
      addToast('Toplu sevk işlemi sırasında bağlantı hatası oluştu.', 'error')
    } finally {
      setBulkProcessing(false)
      setBulkActionType(null)
    }
  }

  // Single Item Label Download
  const handleDownloadSingleLabel = async (shipmentId: string) => {
    if (!canFetch) return
    try {
      const res = await fetch('/api/admin/shipping/bulk-labels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ shipmentIds: [shipmentId] }),
      })
      const data = await res.json()
      if (data.success && data.combinedPdf?.data) {
        const blob = new Blob([Buffer.from(data.combinedPdf.data, 'base64')], {
          type: 'application/pdf',
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = data.combinedPdf.filename || `etiket-${shipmentId}.pdf`
        a.click()
        addToast('Kargo etiketi indirildi.', 'success')
      } else {
        addToast(data.error || 'Etiket indirilemedi.', 'error')
      }
    } catch {
      addToast('Etiket indirilirken bağlantı hatası oluştu.', 'error')
    }
  }

  // Save Carrier Settings
  const handleSaveCarrierSettings = async () => {
    if (!canFetch) return
    setSavingSettings(true)
    try {
      const res = await fetch('/api/admin/shipping/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          outboundCarrier: selectedOutbound,
          returnCarrier: selectedReturn,
        }),
      })
      const data = await res.json()
      if (data.success) {
        addToast('Kargo taşıyıcı ayarları başarıyla kaydedildi.', 'success')
        setShowSettingsModal(false)
        fetchCarrierSettings()
      } else {
        addToast(data.error || 'Ayarlar kaydedilemedi.', 'error')
      }
    } catch {
      addToast('Kargo ayarları kaydedilirken bağlantı hatası oluştu.', 'error')
    } finally {
      setSavingSettings(false)
    }
  }

  return (
    <div className={styles.pageContainer}>
      {/* ── TOP HEADER ────────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 className={styles.title}>Kargo & Sevkiyat Yönetimi</h1>
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '11px',
                fontWeight: 600,
                background: 'rgba(0, 128, 196, 0.1)',
                color: 'var(--brand-blue, #0080c4)',
                border: '1px solid rgba(0, 128, 196, 0.2)',
              }}
            >
              100×100 mm Xprinter XP-470B
            </span>
          </div>
          <p className={styles.subtitle}>
            Günlük kargoya verilecek siparişleri yönetin, tek tıkla toplu etiket üretin ve sevk durumlarını senkronize edin.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setShowSettingsModal(true)}
            className={`${styles.btn} ${styles.btnSecondary}`}
          >
            Kargo Ayarları
          </button>
          <Link href="/admin/settings?tab=SHIPPING" className={`${styles.btn} ${styles.btnSecondary}`}>
            Kargo ücreti ve metni
          </Link>
          <Link href="/admin/warehouse/packing" className={`${styles.btn} ${styles.btnSecondary}`}>
            Paketleme Masası &rarr;
          </Link>
        </div>
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
          onClick={() => handleQuickFilterClick('ready')}
          className={`${styles.selectableCard} ${quickFilter === 'ready' ? styles.selectableCardActive : ''}`}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
            Kargoya Hazır
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {stats.kargoyaHazir}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Paketlenen & gönderilecek
          </div>
        </div>

        <div
          onClick={() => handleQuickFilterClick('label_ready')}
          className={`${styles.selectableCard} ${quickFilter === 'label_ready' ? styles.selectableCardActive : ''}`}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
            Etiket Hazır
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#16a34a', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {stats.etiketHazir}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Yazdırılmaya hazır etiketler
          </div>
        </div>

        <div
          onClick={() => handleQuickFilterClick('awaiting_label')}
          className={`${styles.selectableCard} ${quickFilter === 'awaiting_label' ? styles.selectableCardActive : ''}`}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
            Etiket Bekliyor
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#d97706', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {stats.etiketBekliyor}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Etiket üretimi gerekli
          </div>
        </div>

        <div
          onClick={() => handleQuickFilterClick('shipped')}
          className={`${styles.selectableCard} ${quickFilter === 'shipped' ? styles.selectableCardActive : ''}`}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
            Kargoya Verildi
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#4f46e5', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
            {stats.kargoyaVerildi}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Kuryeye sevk edilenler
          </div>
        </div>
      </div>

      {/* ── XPRINTER NOTICE ─────────────────────────────────────────────────── */}
      <div
        style={{
          background: 'rgba(0, 128, 196, 0.05)',
          border: '1px solid rgba(0, 128, 196, 0.2)',
          borderRadius: 'var(--radius-sm)',
          padding: '10px 14px',
          fontSize: '12px',
          color: 'var(--text-secondary)',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={styles.tabDot} style={{ background: 'var(--zuu-blue)', width: 6, height: 6, borderRadius: '50%', display: 'inline-block' }} />
          <div>
            <strong>Xprinter XP-470B Termal Etiket:</strong> Barkod taşmaması ve optik tarayıcının net okuması için yazdırma ayarlarında <code>Boyut: 100×100 mm</code> ve <code>Ölçek: %100 / Gerçek Boyut (Actual Size)</code> seçilmelidir.
          </div>
        </div>
        <span style={{ fontSize: '11px', color: 'var(--brand-blue, #0080c4)', fontWeight: 600 }}>
          A4 küçültmesi yapılmaz
        </span>
      </div>

      {/* ── OPERATION REPORT ────────────────────────────────────────────────── */}
      {operationReport && (
        <div
          style={{
            background: operationReport.failedCount > 0 ? '#fef2f2' : '#f0fdf4',
            border: operationReport.failedCount > 0 ? '1px solid #fecaca' : '1px solid #bbf7d0',
            borderRadius: 'var(--radius-sm)',
            padding: '14px',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: operationReport.failedCount > 0 ? '#b91c1c' : '#15803d' }}>
              {operationReport.title}
            </div>
            <button
              onClick={() => setOperationReport(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              ✕
            </button>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginTop: '4px' }}>
            {operationReport.successCount} başarılı işlem
            {operationReport.failedCount > 0 && ` · ${operationReport.failedCount} işlem başarısız oldu`}
          </div>

          {operationReport.failures.length > 0 && (
            <div style={{ marginTop: '10px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {operationReport.failures.map((f, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: 'var(--surface-0)',
                      padding: '6px 10px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '12px',
                    }}
                  >
                    <span>
                      <strong style={{ color: '#dc2626' }}>#{f.orderNumber || f.shipmentId}</strong>: {f.error}
                    </span>
                    <button
                      onClick={() => {
                        setSelectedIds([f.shipmentId])
                        if (operationReport.type === 'LABEL') {
                          handleBulkGenerateLabels()
                        } else {
                          setShowBulkShipModal(true)
                        }
                      }}
                      className={styles.secondaryButton}
                      style={{ padding: '2px 8px', fontSize: '11px' }}
                    >
                      Tekrar Dene
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{ padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 'var(--radius-sm)', fontSize: '13px', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {/* ── OPERATIONAL TABS ─────────────────────────────────────────────────── */}
      <div className={styles.operationalTabs}>
        <button
          type="button"
          onClick={() => handleQuickFilterClick('ALL')}
          className={`${styles.operationalTabItem} ${quickFilter === 'ALL' ? styles.active : ''}`}
        >
          Tümü ({stats.todayTotal + stats.kargoyaVerildi})
        </button>
        <button
          type="button"
          onClick={() => handleQuickFilterClick('ready')}
          className={`${styles.operationalTabItem} ${quickFilter === 'ready' ? styles.active : ''}`}
        >
          Kargoya Hazır ({stats.kargoyaHazir})
        </button>
        <button
          type="button"
          onClick={() => handleQuickFilterClick('awaiting_label')}
          className={`${styles.operationalTabItem} ${quickFilter === 'awaiting_label' ? styles.active : ''}`}
        >
          Etiket Bekliyor ({stats.etiketBekliyor})
        </button>
        <button
          type="button"
          onClick={() => handleQuickFilterClick('label_ready')}
          className={`${styles.operationalTabItem} ${quickFilter === 'label_ready' ? styles.active : ''}`}
        >
          Etiketi Hazır ({stats.etiketHazir})
        </button>
        <button
          type="button"
          onClick={() => handleQuickFilterClick('shipped')}
          className={`${styles.operationalTabItem} ${quickFilter === 'shipped' ? styles.active : ''}`}
        >
          Kargoya Verildi ({stats.kargoyaVerildi})
        </button>
      </div>

      {/* ── SEARCH & FILTER CONTROLS ─────────────────────────────────────────── */}
      <div className={styles.filterBar}>
        <form onSubmit={handleSearchSubmit} style={{ flex: 1, minWidth: '240px' }}>
          <input
            type="text"
            placeholder="Sipariş no, takip no veya müşteri adı ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.input}
          />
        </form>

        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          className={styles.select}
          style={{ width: 'auto' }}
        >
          <option value="">Tüm Kanallar</option>
          <option value="DIRECT">ZUULAB Doğrudan Satış</option>
          <option value="MARKETPLACE">Pazaryeri (Trendyol / Hepsiburada)</option>
        </select>

        <select
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value)}
          className={styles.select}
          style={{ width: 'auto' }}
        >
          <option value="">Tüm Taşıyıcılar</option>
          <option value="SURAT">Sürat Kargo</option>
          <option value="PTT">PTT Kargo</option>
          <option value="YURTICI">Yurtiçi Kargo</option>
          <option value="MOCK">Mock Cargo (Simülatör)</option>
        </select>
      </div>

      {/* ── BULK ACTION BAR ──────────────────────────────────────────────────── */}
      {selectedIds.length > 0 && (
        <div
          style={{
            background: 'var(--surface-1)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 16px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {selectedIds.length} gönderi seçildi
            </span>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '12px',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Seçimi Temizle
            </button>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              disabled={bulkProcessing}
              onClick={handleBulkGenerateLabels}
              className={`${styles.btn} ${styles.btnPrimary}`}
              style={{ padding: '6px 12px', fontSize: '12px' }}
            >
              {bulkProcessing && bulkActionType === 'LABEL' ? 'Üretiliyor...' : 'Etiketleri Oluştur'}
            </button>
            <button
              type="button"
              disabled={bulkProcessing}
              onClick={handleBulkDownloadPdf}
              className={`${styles.btn} ${styles.btnSecondary}`}
              style={{ padding: '6px 12px', fontSize: '12px' }}
            >
              {bulkProcessing && bulkActionType === 'PDF' ? 'İndiriliyor...' : 'Toplu PDF'}
            </button>
            <button
              type="button"
              disabled={bulkProcessing}
              onClick={() => setShowBulkShipModal(true)}
              className={`${styles.btn} ${styles.btnSecondary}`}
              style={{ padding: '6px 12px', fontSize: '12px' }}
            >
              Kargoya Sevk Et
            </button>
          </div>
        </div>
      )}

      {/* ── SHIPMENT TABLE ──────────────────────────────────────────────────── */}
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: '36px' }}>
                <input
                  type="checkbox"
                  checked={shipments.length > 0 && selectedIds.length === shipments.length}
                  onChange={handleToggleSelectAll}
                  style={{ cursor: 'pointer' }}
                />
              </th>
              <th>Sipariş No</th>
              <th>Kanal</th>
              <th>Alıcı Müşteri</th>
              <th>Paket / Ağırlık</th>
              <th>Kargo Firması</th>
              <th>Durum</th>
              <th>Takip No</th>
              <th>Tarih</th>
              <th style={{ textAlign: 'right' }}>İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows rows={6} cols={10} />
            ) : shipments.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Kriterlere uygun kargo veya sevk kaydı bulunamadı.
                </td>
              </tr>
            ) : (
              shipments.map((s) => {
                const isSelected = selectedIds.includes(s.id)
                const hasLabel = Boolean(s.currentLabelId || s.status === 'LABEL_READY')
                const statusMeta = SHIPMENT_STATUS_MAP[s.status] || {
                  label: s.status,
                  badgeClass: styles.badgeNeutral,
                }

                return (
                  <tr
                    key={s.id}
                    style={{
                      background: isSelected ? 'rgba(0, 128, 196, 0.04)' : undefined,
                    }}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(s.id)}
                        style={{ cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {s.orderNumber ? (
                        <Link href={`/admin/orders/${s.orderNumber}`} style={{ color: 'var(--brand-blue, #0080c4)' }}>
                          #{s.orderNumber}
                        </Link>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)' }}>
                          #{s.marketplaceOrderNumber || s.id.slice(-8)}
                        </span>
                      )}
                    </td>
                    <td>
                      <span
                        className={styles.badge}
                        style={{
                          fontSize: '10px',
                          background: s.channel === 'MARKETPLACE' ? 'rgba(168, 85, 247, 0.1)' : 'var(--surface-1)',
                          color: s.channel === 'MARKETPLACE' ? '#7e22ce' : 'var(--text-secondary)',
                        }}
                      >
                        {s.channel === 'MARKETPLACE' ? 'PAZARYERİ' : 'DOĞRUDAN'}
                      </span>
                    </td>
                    <td style={{ fontWeight: 500 }}>
                      {s.recipientName || 'Müşteri'}
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                      {s.packageCount || 1} Koli {s.totalWeightKg ? `· ${s.totalWeightKg} kg` : ''}
                    </td>
                    <td style={{ fontSize: '12px' }}>
                      {s.carrier ||
                        (s.provider === 'SURAT'
                          ? 'Sürat Kargo'
                          : s.provider === 'PTT'
                          ? 'PTT Kargo'
                          : s.provider === 'YURTICI'
                          ? 'Yurtiçi Kargo'
                          : s.provider)}
                    </td>
                    <td>
                      <span className={`${styles.badge} ${statusMeta.badgeClass}`}>
                        {statusMeta.label}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                      {s.trackingNumber || '-'}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                      {new Date(s.createdAt).toLocaleDateString('tr-TR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        {hasLabel && (
                          <button
                            type="button"
                            onClick={() => handleDownloadSingleLabel(s.id)}
                            className={styles.secondaryButton}
                            style={{ padding: '4px 8px', fontSize: '11px' }}
                          >
                            Etiket PDF
                          </button>
                        )}
                        <Link
                          href={`/admin/shipping/${s.id}`}
                          className={styles.secondaryButton}
                          style={{ padding: '4px 8px', fontSize: '11px' }}
                        >
                          Detay
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── BULK MARK AS SHIPPED MODAL ────────────────────────────────────────── */}
      <Modal
        isOpen={showBulkShipModal}
        onClose={() => setShowBulkShipModal(false)}
        ariaLabel="Toplu Kargo Sevk Onayı"
        maxWidth={480}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            Toplu Kargo Sevk Onayı
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
            Seçilen <strong>{selectedIds.length}</strong> adet gönderiyi <strong>&quot;Kargoya Verildi&quot; (SHIPPED)</strong> durumuna geçirmek ve fiziksel stok düşümünü onaylamak istiyor musunuz?
          </p>
          <div
            style={{
              padding: '12px',
              background: 'var(--surface-1)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '12px',
              color: 'var(--text-muted)',
            }}
          >
            Bu işlem müşterilere e-posta ile kargo takip bağlantısını iletecek ve ilgili siparişlerin operasyonel durumunu tamamlandı olarak güncelleyecektir.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={() => setShowBulkShipModal(false)}
              className={styles.secondaryButton}
            >
              Vazgeç
            </button>
            <button
              type="button"
              disabled={bulkProcessing}
              onClick={executeBulkMarkAsShipped}
              className={styles.primaryButton}
            >
              {bulkProcessing ? 'İşleniyor...' : 'Kargoya Verildi Olarak İşaretle'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── CARRIER SETTINGS MODAL ───────────────────────────────────────────── */}
      <Modal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        ariaLabel="Kargo Taşıyıcı Entegrasyon Ayarları"
        maxWidth={520}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            Kargo Taşıyıcı Entegrasyon Ayarları
          </h3>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
              Varsayılan Gönderi Taşıyıcısı (Outbound)
            </label>
            <select
              value={selectedOutbound}
              onChange={(e) => setSelectedOutbound(e.target.value)}
              className={styles.select}
            >
              <option value="SURAT">Sürat Kargo (PayTR Anlaşması)</option>
              <option value="PTT">PTT Kargo (Kapıda Ödeme Anlaşması)</option>
              <option value="YURTICI">Yurtiçi Kargo (Doğrudan API)</option>
              <option value="MOCK">Mock Cargo (Simülasyon / Test)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
              Varsayılan İade Taşıyıcısı (Return)
            </label>
            <select
              value={selectedReturn}
              onChange={(e) => setSelectedReturn(e.target.value)}
              className={styles.select}
            >
              <option value="SURAT">Sürat Kargo (SURAT)</option>
              <option value="PTT">PTT Kargo (PTT)</option>
              <option value="YURTICI">Yurtiçi Kargo (YURTICI)</option>
              <option value="MOCK">Mock Cargo (Simülasyon / Test)</option>
            </select>
          </div>

          <div
            style={{
              padding: '12px',
              background: 'var(--surface-1)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '12px',
              color: 'var(--text-muted)',
            }}
          >
            Not: Yurtiçi Kargo entegrasyonu, doğrudan API kimlik bilgileri ortam değişkenlerinden (.env) okunarak otomatik yönetilir.
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={() => setShowSettingsModal(false)}
              className={styles.secondaryButton}
            >
              Kapat
            </button>
            <button
              type="button"
              disabled={savingSettings}
              onClick={handleSaveCarrierSettings}
              className={styles.primaryButton}
            >
              {savingSettings ? 'Kaydediliyor...' : 'Ayarları Kaydet'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
