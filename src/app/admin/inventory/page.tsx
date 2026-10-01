'use client'

import React, { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import Modal from '@/components/common/Modal'
import { getInventoryStatusConfig } from '@/lib/constants/admin-status'
import styles from '../admin.module.css'

interface ChannelInfo {
  storeId: string
  storeName: string
  storeCode: string
  provider: string
  isMapped: boolean
  externalSku: string | null
  safetyBuffer: number
  publishableStock: number
  syncStatus: string
  lastSentQuantity: number | null
  lastError: string | null
  updatedAt: string | null
  hasDrift: boolean
}

interface ProductInventory {
  productId: string
  productName: string
  sku: string
  category: string
  physicalStock: number
  reservedStock: number
  availableStock: number
  lowStockThreshold: number
  status: string
  channels: ChannelInfo[]
}

interface InventoryTransaction {
  id: string
  productId: string
  sku: string
  changeQuantity: number
  previousStock: number
  newStock: number
  previousReserved: number
  newReserved: number
  type: string
  reason: string | null
  orderNumber: string | null
  storeId: string | null
  idempotencyKey: string
  createdAt: string
}

interface QueueItem {
  id: string
  storeId: string
  provider: string
  productId: string
  sku: string
  externalSku: string
  desiredQuantity: number
  lastSentQuantity: number | null
  version: number
  status: string
  attempts: number
  lastError: string | null
  updatedAt: string
}

interface DriftItem {
  id: string
  storeId: string
  provider: string
  sku: string
  externalSku: string
  centralExpected: number
  marketplaceReported: number
  driftDelta: number
  status: string
  detectedAt: string
}

export default function AdminInventoryPage() {
  const { token } = useAuthStore()
  const { addToast } = useToastStore()

  const [activeTab, setActiveTab] = useState<'overview' | 'queue' | 'movements' | 'buffers'>('overview')
  const [products, setProducts] = useState<ProductInventory[]>([])
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([])
  const [queueItems, setQueueItems] = useState<QueueItem[]>([])
  const [drifts, setDrifts] = useState<DriftItem[]>([])
  const [globalBuffer, setGlobalBuffer] = useState<number>(2)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('ALL')
  const [filterProvider, setFilterProvider] = useState<string>('ALL')
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null)

  // Adjust Modal State
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false)
  const [selectedProductId, setSelectedProductId] = useState('')
  const [changeAmount, setChangeAmount] = useState<number | ''>('')
  const [movementType, setMovementType] = useState<string>('RESTOCK')
  const [reason, setReason] = useState('')
  const [submittingAdjust, setSubmittingAdjust] = useState(false)

  // Buffer Edit State
  const [editingBufferStore, setEditingBufferStore] = useState<string | null>(null)
  const [bufferInput, setBufferInput] = useState<number>(2)

  const loadData = async () => {
    if (!token) return
    setLoading(true)
    try {
      const [channelsRes, queueRes] = await Promise.all([
        fetch('/api/admin/inventory/channels', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/inventory/queue', { headers: { Authorization: `Bearer ${token}` } }),
      ])
      const channelsData = await channelsRes.json()
      const queueData = await queueRes.json()

      if (channelsData.success) {
        setProducts(channelsData.products || [])
        setTransactions(channelsData.transactions || [])
        setGlobalBuffer(channelsData.globalSafetyBuffer ?? 2)
      }
      if (queueData.success) {
        setQueueItems(queueData.items || [])
        setDrifts(queueData.drifts || [])
      }
    } catch (err) {
      console.error('Failed to load inventory data:', err)
      addToast('Envanter verileri yüklenirken hata oluştu.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [token])

  const handleSyncProduct = async (productId: string) => {
    if (!token) return
    try {
      const res = await fetch('/api/admin/inventory/sync-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ productId }),
      })
      const data = await res.json()
      if (data.success) {
        addToast('Ürün pazaryeri kanallarına senkronize edildi.', 'success')
        loadData()
      } else {
        addToast(data.error || 'Senkronizasyon hatası oluştu.', 'error')
      }
    } catch {
      addToast('Senkronizasyon servisine ulaşılamadı.', 'error')
    }
  }

  const handleRetryJobs = async () => {
    if (!token) return
    try {
      const res = await fetch('/api/admin/inventory/retry-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (data.success) {
        addToast(`${data.retriedCount} adet hatalı iş kuyruğa tekrar eklendi.`, 'success')
        loadData()
      } else {
        addToast('İşlem tamamlanamadı.', 'error')
      }
    } catch {
      addToast('Kuyruk servisine bağlanılamadı.', 'error')
    }
  }

  const handleScanDrift = async () => {
    if (!token) return
    try {
      const res = await fetch('/api/admin/inventory/queue?scanDrift=true', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        setDrifts(data.drifts || [])
        addToast(`Drift taraması tamamlandı: ${data.drifts?.length || 0} adet tutarsızlık tespit edildi.`, 'info')
      } else {
        addToast('Drift taraması başarısız oldu.', 'error')
      }
    } catch {
      addToast('Drift tarama servisine ulaşılamadı.', 'error')
    }
  }

  const handleSaveBuffer = async (storeId?: string, isGlobal = false) => {
    if (!token) return
    try {
      const res = await fetch('/api/admin/inventory/buffers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          storeId,
          safetyBuffer: bufferInput,
          isGlobal,
        }),
      })
      const data = await res.json()
      if (data.success) {
        addToast('Güvenlik tamponu başarıyla güncellendi.', 'success')
        setEditingBufferStore(null)
        loadData()
      } else {
        addToast(data.error || 'Tampon güncellenemedi.', 'error')
      }
    } catch {
      addToast('Tampon servisiyle bağlantı kurulamadı.', 'error')
    }
  }

  const openAdjustModal = (productId?: string) => {
    setSelectedProductId(productId || (products[0]?.productId ?? ''))
    setChangeAmount('')
    setMovementType('RESTOCK')
    setReason('')
    setIsAdjustModalOpen(true)
  }

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !selectedProductId || changeAmount === '' || !reason.trim()) return

    setSubmittingAdjust(true)
    try {
      const res = await fetch('/api/admin/inventory/adjust', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          productId: selectedProductId,
          quantityChange: Number(changeAmount),
          movementType,
          reason: reason.trim(),
        }),
      })

      const data = await res.json()
      if (data.success) {
        addToast(`Stok düzeltmesi kaydedildi: ${Number(changeAmount) > 0 ? '+' : ''}${changeAmount}`, 'success')
        setIsAdjustModalOpen(false)
        loadData()
      } else {
        addToast(data.error || 'Stok güncellenemedi.', 'error')
      }
    } catch {
      addToast('İşlem sırasında bir hata oluştu.', 'error')
    } finally {
      setSubmittingAdjust(false)
    }
  }

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((prod) => {
      const matchSearch =
        prod.productName.toLowerCase().includes(search.toLowerCase()) ||
        prod.sku.toLowerCase().includes(search.toLowerCase())
      if (!matchSearch) return false

      if (filterStatus === 'LOW_STOCK' && (prod.availableStock > prod.lowStockThreshold || prod.availableStock <= 0)) return false
      if (filterStatus === 'OUT_OF_STOCK' && prod.availableStock > 0) return false
      if (filterStatus === 'IN_STOCK' && prod.availableStock <= 0) return false

      if (filterProvider !== 'ALL') {
        const hasProvider = prod.channels.some((c) => c.provider === filterProvider && c.isMapped)
        if (!hasProvider) return false
      }

      return true
    })
  }, [products, search, filterStatus, filterProvider])

  // Computed High-Level Metrics
  const metrics = useMemo(() => {
    const totalProducts = products.length
    const lowStock = products.filter((p) => p.availableStock <= p.lowStockThreshold && p.availableStock > 0).length
    const outOfStock = products.filter((p) => p.availableStock <= 0).length
    const totalPhysical = products.reduce((acc, p) => acc + p.physicalStock, 0)
    const totalReserved = products.reduce((acc, p) => acc + p.reservedStock, 0)
    const totalAvailable = products.reduce((acc, p) => acc + p.availableStock, 0)
    const pendingJobs = queueItems.filter((q) => q.status === 'PENDING').length
    const failedJobs = queueItems.filter((q) => q.status === 'FAILED').length
    return { totalProducts, lowStock, outOfStock, totalPhysical, totalReserved, totalAvailable, pendingJobs, failedJobs }
  }, [products, queueItems])

  const selectedProduct = products.find((p) => p.productId === selectedProductId)

  return (
    <div className={styles.page}>
      {/* Page Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Envanter & Stok Operasyonları</h1>
          <p className={styles.subtitle}>
            Fiziksel stok, sipariş rezervasyonları, pazaryeri kotaları ve tekil stok gerçeği (SSOT).
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={handleRetryJobs}
            title="Senkronizasyon hatası alan işleri tekrar kuyruğa al"
          >
            ↻ Hatalı Kuyrukları Yenile
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => openAdjustModal()}
          >
            + Manuel Stok Ayarla
          </button>
        </div>
      </div>

      {/* Typography-led Operational Metrics Strip */}
      <div className={styles.metricsStrip}>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Toplam Ürün</div>
          <div className={styles.metricValue}>{metrics.totalProducts}</div>
          <div className={styles.metricSub}>Kayıtlı katalog varyantları</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Kritik & Tükendi</div>
          <div className={styles.metricValue} style={{ color: (metrics.lowStock + metrics.outOfStock) > 0 ? 'var(--warning)' : 'inherit' }}>
            {metrics.lowStock + metrics.outOfStock}
          </div>
          <div className={styles.metricSub}>{metrics.outOfStock} tükendi · {metrics.lowStock} eşik altı</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Rezerve Stok</div>
          <div className={styles.metricValue} style={{ color: 'var(--zuu-blue, #0284c7)' }}>
            {metrics.totalReserved}
          </div>
          <div className={styles.metricSub}>Bekleyen siparişlere ayrılmış</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Satılabilir Stok</div>
          <div className={styles.metricValue} style={{ color: 'var(--success)' }}>
            {metrics.totalAvailable}
          </div>
          <div className={styles.metricSub}>Toplam fiziksel: {metrics.totalPhysical} adet</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Kanal Kuyruğu</div>
          <div className={styles.metricValue} style={{ color: metrics.failedJobs > 0 ? 'var(--danger)' : 'inherit' }}>
            {metrics.pendingJobs}
          </div>
          <div className={styles.metricSub}>{metrics.failedJobs > 0 ? `${metrics.failedJobs} hatalı kuyruk işi` : 'Tüm kanallar senkron'}</div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className={styles.operationalTabs}>
        {[
          { key: 'overview', label: `Merkezi & Kanal Stokları (${products.length})` },
          { key: 'queue', label: `Senkronizasyon Kuyruğu & Drift (${queueItems.length})` },
          { key: 'movements', label: `Stok Defteri (Ledger) (${transactions.length})` },
          { key: 'buffers', label: 'Güvenlik Tamponu Ayarları' },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key as any)}
            className={`${styles.operationalTabItem} ${activeTab === tab.key ? styles.active : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB 1: OVERVIEW ──────────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div>
          {/* Filters Bar */}
          <div className={styles.filterBar}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="search"
                placeholder="Ürün adı veya SKU ile ara..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={styles.searchBox}
                style={{ width: 280 }}
              />

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className={styles.searchBox}
              >
                <option value="ALL">Tüm Stok Durumları</option>
                <option value="IN_STOCK">Yeterli Stok</option>
                <option value="LOW_STOCK">Kritik Stok (Eşik Altı)</option>
                <option value="OUT_OF_STOCK">Tükenenler (0)</option>
              </select>

              <select
                value={filterProvider}
                onChange={(e) => setFilterProvider(e.target.value)}
                className={styles.searchBox}
              >
                <option value="ALL">Tüm Satış Kanalları</option>
                <option value="TRENDYOL">Trendyol</option>
                <option value="HEPSIBURADA">Hepsiburada</option>
                <option value="AMAZON">Amazon</option>
              </select>
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Gösterilen: <strong>{filteredProducts.length}</strong> / {products.length} ürün
            </div>
          </div>

          {/* Stock Table */}
          <div className={styles.tableCard}>
            {loading ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                Envanter verileri yükleniyor...
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className={styles.emptyState}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                  Stok kaydı bulunamadı.
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Arama kriterlerinize uygun ürün bulunamadı veya envanter boş.
                </div>
              </div>
            ) : (
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Ürün</th>
                      <th>SKU</th>
                      <th style={{ textAlign: 'right' }}>Fiziksel</th>
                      <th style={{ textAlign: 'right' }}>Rezerve</th>
                      <th style={{ textAlign: 'right' }}>Satılabilir</th>
                      <th>Pazaryeri Dağıtımı</th>
                      <th>Durum</th>
                      <th style={{ textAlign: 'right' }}>İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((p) => {
                      const isLow = p.availableStock <= p.lowStockThreshold && p.availableStock > 0
                      const isOut = p.availableStock <= 0
                      const statusKey = isOut ? 'OUT_OF_STOCK' : isLow ? 'LOW_STOCK' : 'IN_STOCK'
                      const statusCfg = getInventoryStatusConfig(statusKey)
                      const isExpanded = expandedProductId === p.productId

                      return (
                        <React.Fragment key={p.productId}>
                          <tr>
                            <td>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                {p.productName}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                {p.category || 'Genel'}
                              </div>
                            </td>

                            <td>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>
                                {p.sku}
                              </span>
                            </td>

                            <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                              {p.physicalStock}
                            </td>

                            <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: p.reservedStock > 0 ? 'var(--zuu-blue, #0284c7)' : 'var(--text-muted)' }}>
                              {p.reservedStock}
                            </td>

                            <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: isOut ? 'var(--danger)' : isLow ? 'var(--warning)' : 'var(--text-primary)' }}>
                              {p.availableStock}
                            </td>

                            <td>
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {p.channels && p.channels.length > 0 ? (
                                  p.channels.map((c) => (
                                    <span
                                      key={c.storeId}
                                      style={{
                                        fontSize: 10,
                                        padding: '1px 5px',
                                        borderRadius: 3,
                                        background: c.hasDrift ? '#fee2e2' : 'var(--surface-2)',
                                        color: c.hasDrift ? '#991b1b' : 'var(--text-secondary)',
                                        border: `1px solid ${c.hasDrift ? '#fecaca' : 'var(--border)'}`,
                                        fontFamily: 'var(--font-mono)',
                                      }}
                                      title={`${c.storeName}: Kota ${c.publishableStock} (Tampon: ${c.safetyBuffer})`}
                                    >
                                      {c.provider.slice(0, 3)}: {c.publishableStock}
                                    </span>
                                  ))
                                ) : (
                                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Doğrudan Vitrin</span>
                                )}
                              </div>
                            </td>

                            <td>
                              <span className={`${styles.badge} ${statusCfg.badgeClass}`}>
                                {statusCfg.label}
                              </span>
                            </td>

                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'inline-flex', gap: 6 }}>
                                <button
                                  type="button"
                                  className={styles.secondaryBtn}
                                  style={{ padding: '3px 8px', fontSize: 11 }}
                                  onClick={() => setExpandedProductId(isExpanded ? null : p.productId)}
                                >
                                  {isExpanded ? 'Kapat' : 'Kanallar'}
                                </button>
                                <button
                                  type="button"
                                  className={styles.secondaryBtn}
                                  style={{ padding: '3px 8px', fontSize: 11 }}
                                  onClick={() => openAdjustModal(p.productId)}
                                >
                                  Düzelt
                                </button>
                                {(isLow || isOut) && (
                                  <Link
                                    href={`/admin/production/new?productId=${p.productId}&quantity=20&priority=HIGH`}
                                    className={styles.primaryBtn}
                                    style={{ padding: '3px 8px', fontSize: 11, textDecoration: 'none', background: 'var(--zuu-blue)', borderColor: 'var(--zuu-blue)' }}
                                    title="Stok kritik seviyede, hemen üretim emri aç"
                                  >
                                    + Üretim
                                  </Link>
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* Expanded Channel Detail Drawer Row */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={8} style={{ background: 'var(--surface-1)', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {p.productName} — Pazaryeri Kanal Dağıtımı & Senkronizasyon Durumu
                                  </span>
                                  <button
                                    type="button"
                                    className={styles.secondaryBtn}
                                    style={{ padding: '3px 8px', fontSize: 11 }}
                                    onClick={() => handleSyncProduct(p.productId)}
                                  >
                                    Tüm Kanalları Eşitle (Sync)
                                  </button>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                                  {p.channels.map((c) => (
                                    <div
                                      key={c.storeId}
                                      style={{
                                        background: 'var(--surface-0)',
                                        border: '1px solid var(--border)',
                                        borderRadius: 6,
                                        padding: 12,
                                        fontSize: 12,
                                      }}
                                    >
                                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <strong style={{ color: 'var(--text-primary)' }}>{c.storeName}</strong>
                                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{c.provider}</span>
                                      </div>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', marginBottom: 2 }}>
                                        <span>Yayınlanan Kota:</span>
                                        <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{c.publishableStock}</strong>
                                      </div>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: 11 }}>
                                        <span>Güvenlik Tamponu:</span>
                                        <span>-{c.safetyBuffer} adet</span>
                                      </div>
                                      {c.hasDrift && (
                                        <div style={{ marginTop: 6, color: 'var(--danger)', fontSize: 11, fontWeight: 600 }}>
                                          Kanal stok drifti tespit edildi!
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 2: QUEUE & DRIFTS ─────────────────────────────────────────────────── */}
      {activeTab === 'queue' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Pazaryeri API asenkron kuyruğundaki bekleyen ve tamamlanan senkronizasyon olayları.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={handleScanDrift}
              >
                Drift Taraması Başlat
              </button>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={handleRetryJobs}
              >
                Hataları Yeniden Sıraya Al
              </button>
            </div>
          </div>

          <div className={styles.tableCard}>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Pazaryeri</th>
                    <th>Hedef Miktar</th>
                    <th>Son İletilen</th>
                    <th>Durum</th>
                    <th>Deneme</th>
                    <th>Son Güncelleme</th>
                  </tr>
                </thead>
                <tbody>
                  {queueItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                        Kuyrukta bekleyen işlem bulunmuyor.
                      </td>
                    </tr>
                  ) : (
                    queueItems.map((q) => (
                      <tr key={q.id}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{q.sku}</td>
                        <td>{q.provider}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{q.desiredQuantity}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{q.lastSentQuantity ?? '—'}</td>
                        <td>
                          <span
                            className={styles.badge}
                            style={{
                              background: q.status === 'COMPLETED' ? '#dcfce7' : q.status === 'FAILED' ? '#fee2e2' : '#fef3c7',
                              color: q.status === 'COMPLETED' ? '#166534' : q.status === 'FAILED' ? '#991b1b' : '#b45309',
                            }}
                          >
                            {q.status}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{q.attempts}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {new Date(q.updatedAt).toLocaleTimeString('tr-TR')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: MOVEMENTS / AUDIT LEDGER ─────────────────────────────────────── */}
      {activeTab === 'movements' && (
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
            Değişmez denetim defteri: Sipariş rezervasyonları, üretim tamamlanmaları, iadeler ve manuel müdahaleler.
          </div>

          <div className={styles.tableCard}>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>SKU</th>
                    <th>İşlem Tipi</th>
                    <th style={{ textAlign: 'right' }}>Miktar Değişimi</th>
                    <th style={{ textAlign: 'right' }}>Yeni Stok</th>
                    <th>Gerekçe / Sipariş</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                        Kayıtlı stok hareketi bulunmuyor.
                      </td>
                    </tr>
                  ) : (
                    transactions.map((tx) => (
                      <tr key={tx.id}>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {new Date(tx.createdAt).toLocaleString('tr-TR')}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{tx.sku}</td>
                        <td>
                          <span className={styles.badge} style={{ fontSize: 10 }}>{tx.type}</span>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: tx.changeQuantity > 0 ? '#16a34a' : 'var(--danger)' }}>
                          {tx.changeQuantity > 0 ? `+${tx.changeQuantity}` : tx.changeQuantity}
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                          {tx.newStock} (Rez: {tx.newReserved})
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {tx.reason || (tx.orderNumber ? `Sipariş #${tx.orderNumber}` : '—')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 4: SAFETY BUFFERS ───────────────────────────────────────────────── */}
      {activeTab === 'buffers' && (
        <div style={{ maxWidth: 640 }}>
          <div className={styles.cardPanel}>
            <div className={styles.panelHeader}>
              <span className={styles.panelTitle}>Global Güvenlik Tamponu (Safety Buffer)</span>
            </div>
            <div className={styles.panelBody}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 16px 0' }}>
                Güvenlik tamponu, pazaryerlerinde eşzamanlı satışlarda aşırı satışı (overselling) engellemek amacıyla merkezi stoktan düşülerek kanallara aktarılan rezerve miktardır.
              </p>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={globalBuffer}
                  onChange={(e) => setGlobalBuffer(Number(e.target.value))}
                  className={styles.searchBox}
                  style={{ width: 100, fontSize: 14, fontFamily: 'var(--font-mono)', fontWeight: 600 }}
                />
                <button
                  type="button"
                  className={styles.primaryBtn}
                  onClick={() => handleSaveBuffer(undefined, true)}
                >
                  Global Tamponu Kaydet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Stock Adjust Modal (UI-16 Global Modal) */}
      <Modal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
        ariaLabel="Manuel Stok Düzeltmesi"
      >
        <form onSubmit={handleAdjustSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            Manuel Stok Düzeltmesi
          </h3>

          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Bu işlem merkezi fiziksel stoğu doğrudan değiştirir ve tüm pazaryeri kanallarına otomatik senkronizasyon tetikler.
          </p>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
              Ürün Seçimi
            </label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className={styles.searchBox}
              style={{ width: '100%', fontSize: 12 }}
              required
            >
              {products.map((p) => (
                <option key={p.productId} value={p.productId}>
                  {p.productName} ({p.sku}) — Mevcut: {p.physicalStock} adet
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                İşlem Tipi
              </label>
              <select
                value={movementType}
                onChange={(e) => setMovementType(e.target.value)}
                className={styles.searchBox}
                style={{ width: '100%', fontSize: 12 }}
              >
                <option value="RESTOCK">Stok Girişi (Restock)</option>
                <option value="CORRECTION">Sayım Düzeltmesi</option>
                <option value="DAMAGE">Hasar / Fire Çıkışı</option>
                <option value="RETURN">Müşteri İade Girişi</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                Değişim Miktarı (Pozitif / Negatif)
              </label>
              <input
                type="number"
                placeholder="Örn: +10 veya -3"
                value={changeAmount}
                onChange={(e) => setChangeAmount(e.target.value === '' ? '' : Number(e.target.value))}
                className={styles.searchBox}
                style={{ width: '100%', fontSize: 13, fontFamily: 'var(--font-mono)' }}
                required
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
              Denetim Gerekçesi (Zorunlu)
            </label>
            <textarea
              rows={2}
              placeholder="Örn: Hafta sonu fiziksel raf sayımı fazlası..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={styles.searchBox}
              style={{ width: '100%', fontSize: 12, resize: 'vertical' }}
              required
            />
          </div>

          {selectedProduct && changeAmount !== '' && (
            <div style={{ padding: '10px 14px', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12 }}>
              Yeni Fiziksel Stok: <strong>{selectedProduct.physicalStock + Number(changeAmount)}</strong> adet (Önceki: {selectedProduct.physicalStock})
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => setIsAdjustModalOpen(false)}
              disabled={submittingAdjust}
            >
              Vazgeç
            </button>
            <button
              type="submit"
              className={styles.primaryBtn}
              disabled={submittingAdjust || changeAmount === '' || !reason.trim()}
            >
              {submittingAdjust ? 'Kaydediliyor...' : 'Değişikliği Uygula'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
