'use client'

import React, { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import Modal from '@/components/common/Modal'
import { getWaveStatusConfig } from '@/lib/constants/admin-status'
import styles from '../../admin.module.css'

interface WarehouseWave {
  id: string
  waveNumber: string
  status: string
  priority: number
  assignedOperatorId: string | null
  orderCount: number
  totalUnits: number
  estimatedWalkingPath: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  items?: any[]
}

interface FulfillmentItem {
  id: string
  orderNumber: string | null
  marketplaceOrderNumber: string | null
  channel: string
  priority: number
  items?: any[]
}

export default function AdminWarehouseWavesPage() {
  const router = useRouter()
  const { token, user } = useAuthStore()
  const { addToast } = useToastStore()

  const [waves, setWaves] = useState<WarehouseWave[]>([])
  const [eligibleOrders, setEligibleOrders] = useState<FulfillmentItem[]>([])
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [expandedWaveId, setExpandedWaveId] = useState<string | null>(null)

  // Create Wave Modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [prioritizeCutoffs, setPrioritizeCutoffs] = useState(true)

  // Cancel Wave Modal State
  const [waveToCancel, setWaveToCancel] = useState<WarehouseWave | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const fetchWaves = async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/warehouse/waves', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        setWaves(data.waves || [])
      } else {
        addToast(data.error || 'Dalgalar alınamadı.', 'error')
      }

      // Also fetch ready fulfillments for wave creation
      const resFul = await fetch('/api/admin/warehouse?status=READY_TO_PICK', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const dataFul = await resFul.json()
      if (dataFul.success && dataFul.fulfillments) {
        const available = dataFul.fulfillments.filter((f: any) => !f.waveId)
        setEligibleOrders(available)
      }
    } catch {
      addToast('Dalga servisine ulaşılamadı.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchWaves()
  }, [token])

  const handleCreateWave = async () => {
    if (selectedOrderIds.length === 0 || !token) return
    setCreating(true)

    try {
      const res = await fetch('/api/admin/warehouse/waves', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fulfillmentIds: selectedOrderIds,
          assignedOperatorId: user?.name || user?.email || 'Admin',
          prioritizeApproachingCutoffs: prioritizeCutoffs,
        }),
      })

      const data = await res.json()
      if (data.success) {
        addToast(
          `Dalga #${data.wave.waveNumber} oluşturuldu (${data.wave.orderCount} sipariş, ${data.wave.totalUnits} adet). Rota optimize edildi.`,
          'success'
        )
        setShowCreateModal(false)
        setSelectedOrderIds([])
        fetchWaves()
      } else {
        addToast(data.error || 'Dalga oluşturulamadı.', 'error')
      }
    } catch {
      addToast('Dalga kaydı sırasında hata oluştu.', 'error')
    } finally {
      setCreating(false)
    }
  }

  const handleStartWave = async (waveId: string) => {
    if (!token) return
    try {
      const res = await fetch(`/api/admin/warehouse/waves/${waveId}/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        addToast(`Dalga #${data.wave.waveNumber} toplama aşamasına alındı.`, 'success')
        fetchWaves()
      } else {
        addToast(data.error || 'Dalga başlatılamadı.', 'error')
      }
    } catch {
      addToast('Dalga başlatılırken hata oluştu.', 'error')
    }
  }

  const handleCompleteWave = async (waveId: string) => {
    if (!token) return
    try {
      const res = await fetch(`/api/admin/warehouse/waves/${waveId}/complete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        addToast(`Dalga #${data.wave.waveNumber} başarıyla tamamlandı.`, 'success')
        fetchWaves()
      } else {
        addToast(data.error || 'Dalga tamamlanamadı.', 'error')
      }
    } catch {
      addToast('Dalga tamamlanırken hata oluştu.', 'error')
    }
  }

  const handleConfirmCancelWave = async () => {
    if (!waveToCancel || !token) return
    setCancelling(true)

    try {
      const res = await fetch(`/api/admin/warehouse/waves/${waveToCancel.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.success) {
        addToast(`Dalga #${waveToCancel.waveNumber} iptal edildi.`, 'info')
        setWaveToCancel(null)
        fetchWaves()
      } else {
        addToast(data.error || 'Dalga iptal edilemedi.', 'error')
      }
    } catch {
      addToast('Dalga iptal edilirken hata oluştu.', 'error')
    } finally {
      setCancelling(false)
    }
  }

  const toggleSelectOrder = (id: string) => {
    setSelectedOrderIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  // Filtered waves
  const filteredWaves = useMemo(() => {
    return waves.filter((w) => {
      const matchSearch =
        w.waveNumber.toLowerCase().includes(search.toLowerCase()) ||
        (w.assignedOperatorId && w.assignedOperatorId.toLowerCase().includes(search.toLowerCase()))
      if (!matchSearch) return false

      if (statusFilter !== 'ALL' && w.status !== statusFilter) return false
      return true
    })
  }, [waves, search, statusFilter])

  // Computed metrics
  const metrics = useMemo(() => {
    const total = waves.length
    const planned = waves.filter((w) => w.status === 'PLANNED').length
    const inProgress = waves.filter((w) => w.status === 'IN_PROGRESS').length
    const completed = waves.filter((w) => w.status === 'COMPLETED').length
    const totalUnits = waves
      .filter((w) => w.status === 'IN_PROGRESS' || w.status === 'PLANNED')
      .reduce((acc, w) => acc + (w.totalUnits || 0), 0)
    return { total, planned, inProgress, completed, totalUnits }
  }, [waves])

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Depo Toplama Dalgaları (Waves)</h1>
          <p className={styles.subtitle}>
            Siparişleri toplama dalgalarında gruplayın, depo rotasını optimize edin ve sevkiyata hazırlayın.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => fetchWaves()}
            disabled={loading}
          >
            Yenile
          </button>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => setShowCreateModal(true)}
          >
            + Yeni Dalga Oluştur
          </button>
        </div>
      </div>

      {/* Metrics Strip */}
      <div className={styles.metricsStrip}>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Toplam Dalga</div>
          <div className={styles.metricValue}>{metrics.total}</div>
          <div className={styles.metricSub}>Kayıtlı toplama dalgaları</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Planlanan</div>
          <div className={styles.metricValue}>{metrics.planned}</div>
          <div className={styles.metricSub}>Toplama sırasını bekleyen</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Toplamada (Aktif)</div>
          <div className={styles.metricValue} style={{ color: 'var(--zuu-blue, #0284c7)' }}>
            {metrics.inProgress}
          </div>
          <div className={styles.metricSub}>Depoda toplanan siparişler</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Tamamlanan</div>
          <div className={styles.metricValue} style={{ color: 'var(--success)' }}>
            {metrics.completed}
          </div>
          <div className={styles.metricSub}>Paketlemeye hazır veya sevk edildi</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Aktif Toplanacak Ürün</div>
          <div className={styles.metricValue} style={{ fontFamily: 'var(--font-mono)' }}>
            {metrics.totalUnits} <span style={{ fontSize: 14, fontWeight: 500 }}>adet</span>
          </div>
          <div className={styles.metricSub}>Açık dalgalardaki ürün adedi</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className={styles.filterBar}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="search"
            placeholder="Dalga no (#W-...) veya operatör ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.searchBox}
            style={{ width: 280 }}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={styles.searchBox}
            style={{ fontSize: 12 }}
          >
            <option value="ALL">Tüm Dalga Durumları</option>
            <option value="PLANNED">Planlandı</option>
            <option value="IN_PROGRESS">Hazırlanıyor / Toplamada</option>
            <option value="COMPLETED">Tamamlandı</option>
            <option value="CANCELLED">İptal Edildi</option>
          </select>
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Kayıt: <strong>{filteredWaves.length}</strong> / {waves.length} dalga
        </div>
      </div>

      {/* Waves Table */}
      <div className={styles.tableCard}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Toplama dalgaları yükleniyor...
          </div>
        ) : filteredWaves.length === 0 ? (
          <div className={styles.emptyState}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
              Dalga bulunamadı.
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Arama kriterlerine uygun dalga yok. Sevkiyata hazır siparişlerle yeni bir toplama dalgası oluşturabilirsiniz.
            </div>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Dalga No</th>
                  <th>Durum</th>
                  <th style={{ textAlign: 'right' }}>Sipariş</th>
                  <th style={{ textAlign: 'right' }}>Toplam Adet</th>
                  <th>Atanan Operatör</th>
                  <th>Toplama Rotası</th>
                  <th>Oluşturulma Tarihi</th>
                  <th style={{ textAlign: 'right' }}>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {filteredWaves.map((w) => {
                  const statusCfg = getWaveStatusConfig(w.status)
                  const isExpanded = expandedWaveId === w.id

                  return (
                    <React.Fragment key={w.id}>
                      <tr>
                        <td>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>
                            #{w.waveNumber}
                          </span>
                        </td>

                        <td>
                          <span className={`${styles.badge} ${statusCfg.badgeClass}`}>
                            {statusCfg.label}
                          </span>
                        </td>

                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                          {w.orderCount}
                        </td>

                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                          {w.totalUnits}
                        </td>

                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {w.assignedOperatorId || 'Atanmadı'}
                        </td>

                        <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 220 }}>
                          {w.estimatedWalkingPath || 'Sıralı Depo Rotası'}
                        </td>

                        <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {new Date(w.createdAt).toLocaleString('tr-TR')}
                        </td>

                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <button
                              type="button"
                              className={styles.secondaryBtn}
                              style={{ padding: '3px 8px', fontSize: 11 }}
                              onClick={() => setExpandedWaveId(isExpanded ? null : w.id)}
                            >
                              {isExpanded ? 'Gizle' : 'Siparişler'}
                            </button>

                            {w.status === 'PLANNED' && (
                              <button
                                type="button"
                                className={styles.primaryBtn}
                                style={{ padding: '3px 8px', fontSize: 11 }}
                                onClick={() => handleStartWave(w.id)}
                              >
                                Başlat
                              </button>
                            )}

                            {w.status === 'IN_PROGRESS' && (
                              <button
                                type="button"
                                className={styles.primaryBtn}
                                style={{ padding: '3px 8px', fontSize: 11, background: '#10b981', borderColor: '#10b981' }}
                                onClick={() => handleCompleteWave(w.id)}
                              >
                                Tamamla
                              </button>
                            )}

                            {w.status !== 'COMPLETED' && w.status !== 'CANCELLED' && (
                              <button
                                type="button"
                                className={styles.secondaryBtn}
                                style={{ padding: '3px 8px', fontSize: 11, color: 'var(--danger)', borderColor: 'var(--danger)' }}
                                onClick={() => setWaveToCancel(w)}
                              >
                                İptal
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Drawer: Orders inside wave */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} style={{ background: 'var(--surface-1)', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                              Dalga #{w.waveNumber} İçeriğindeki Siparişler & Kalemler
                            </div>

                            {w.items && w.items.length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {w.items.map((it: any, idx: number) => (
                                  <div
                                    key={idx}
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      padding: '8px 12px',
                                      background: 'var(--surface-0)',
                                      border: '1px solid var(--border)',
                                      borderRadius: 4,
                                      fontSize: 12,
                                    }}
                                  >
                                    <div>
                                      <span>Sipariş: </span>
                                      <Link
                                        href={`/admin/orders/${it.orderNumber || ''}`}
                                        style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--zuu-blue)', textDecoration: 'none' }}
                                      >
                                        #{it.orderNumber || it.fulfillmentId} ↗
                                      </Link>
                                      {it.sku && <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>SKU: {it.sku}</span>}
                                    </div>
                                    <div>
                                      Adet: <strong>{it.quantity || 1}</strong> · Raf Konumu: <span style={{ fontFamily: 'var(--font-mono)' }}>{it.location || 'A1'}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                Bu dalga için detaylı sipariş kalemleri yüklenemedi veya henüz atanmadı.
                              </div>
                            )}
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

      {/* Create Wave Modal */}
      {showCreateModal && (
        <Modal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          ariaLabel="Yeni Toplama Dalgası Oluştur"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
              Yeni Toplama Dalgası Oluştur
            </h3>

            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
              Toplama emrine hazır olan siparişleri seçin. Sistem otomatik olarak en kısa depo yürüyüş rotasını hesaplar.
            </p>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                  Hazır Siparişler ({eligibleOrders.length} adet uygun)
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Seçilen: {selectedOrderIds.length} sipariş
                </span>
              </div>

              <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 4, padding: 8 }}>
                {eligibleOrders.length === 0 ? (
                  <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                    Şu anda dalgaya eklenebilecek hazır sipariş bulunmuyor.
                  </div>
                ) : (
                  eligibleOrders.map((ord) => (
                    <label
                      key={ord.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 8px',
                        borderBottom: '1px solid var(--border-subtle)',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={selectedOrderIds.includes(ord.id)}
                          onChange={() => toggleSelectOrder(ord.id)}
                        />
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                          #{ord.orderNumber || ord.id.slice(0, 8)}
                        </span>
                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({ord.channel})</span>
                      </div>
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                        Öncelik: {ord.priority}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={prioritizeCutoffs}
                onChange={(e) => setPrioritizeCutoffs(e.target.checked)}
              />
              <span>Kargo teslim saati (cutoff) yaklaşan siparişleri rotada öne al</span>
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setShowCreateModal(false)}
                disabled={creating}
              >
                Vazgeç
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                disabled={creating || selectedOrderIds.length === 0}
                onClick={handleCreateWave}
              >
                {creating ? 'Oluşturuluyor...' : `Dalgayı Oluştur (${selectedOrderIds.length} Sipariş)`}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Cancel Wave Modal */}
      {waveToCancel && (
        <Modal
          isOpen={!!waveToCancel}
          onClose={() => setWaveToCancel(null)}
          ariaLabel="Dalgayı İptal Et"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
              Toplama Dalgasını İptal Et
            </h3>

            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
              <strong>#{waveToCancel.waveNumber}</strong> numaralı toplama dalgasını iptal etmek istediğinize emin misiniz?
              İçerisindeki siparişler serbest bırakılacak ve yeni dalgalara eklenebilir hale gelecektir.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setWaveToCancel(null)}
                disabled={cancelling}
              >
                Vazgeç
              </button>
              <button
                type="button"
                className={styles.secondaryBtn}
                style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                disabled={cancelling}
                onClick={handleConfirmCancelWave}
              >
                {cancelling ? 'İptal Ediliyor...' : 'Dalgayı İptal Et'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
