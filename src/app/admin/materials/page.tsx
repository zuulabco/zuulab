'use client'

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import { useToastStore } from '@/store/toastStore'
import Modal from '@/components/common/Modal'
import { getMaterialReadinessStatusConfig } from '@/lib/constants/admin-status'
import styles from '../admin.module.css'

interface MaterialStockItem {
  id: string
  storeId?: string | null
  materialName: string
  color: string | null
  quantityGrams: number
  minimumQuantityGrams: number
  location?: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  pricePerKgTl?: number | null
  totalValueTl?: number | null
}

interface MaterialReadinessItem {
  materialName: string
  color: string | null
  availableGrams: number
  requiredGrams: number
  minimumGrams: number
  remainingGrams: number
  missingGrams: number
  status: 'READY' | 'LOW' | 'BLOCKED' | 'UNKNOWN'
  stockId?: string | null
  pricePerKgTl?: number | null
  estimatedRequiredCostTl?: number | null
  affectedProductsCount: number
  isBlocked: boolean
}

interface MaterialReadinessSummary {
  totalMaterialGrams: number
  totalMaterialValueTl: number
  criticalMaterialCount: number
  blockingMaterialCount: number
  todayRequiredGrams: number
  productionDemandCount: number
  producibleCount: number
  blockedCount: number
  materials: MaterialReadinessItem[]
  blockers: Array<{
    productId: string
    productName: string
    sku: string
    productionQuantity: number
    materialName: string
    color: string | null
    requiredGrams: number
    availableGrams: number
    missingGrams: number
    status: 'READY' | 'LOW' | 'BLOCKED' | 'UNKNOWN'
    actionUrl: string
  }>
}

export default function MaterialsPage() {
  const { token, user } = useAuthStore()
  const { addToast } = useToastStore()

  const [stocks, setStocks] = useState<MaterialStockItem[]>([])
  const [readiness, setReadiness] = useState<MaterialReadinessSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<string>('ALL')

  // Adjustment Modal State
  const [adjustModalStock, setAdjustModalStock] = useState<MaterialStockItem | null>(null)
  const [adjustDelta, setAdjustDelta] = useState<number | ''>('')
  const [adjustType, setAdjustType] = useState<'PURCHASE' | 'MANUAL_ADJUSTMENT'>('MANUAL_ADJUSTMENT')
  const [adjustReason, setAdjustReason] = useState<string>('')
  const [adjustReference, setAdjustReference] = useState<string>('')
  const [submittingAdjust, setSubmittingAdjust] = useState(false)

  // New Material Modal State
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newMaterialName, setNewMaterialName] = useState('PLA')
  const [newColor, setNewColor] = useState('')
  const [newQuantityGrams, setNewQuantityGrams] = useState<number | ''>(1000)
  const [newMinGrams, setNewMinGrams] = useState<number | ''>(1000)
  const [newPricePerKg, setNewPricePerKg] = useState<number | ''>(350)
  const [newLocation, setNewLocation] = useState('')
  const [submittingCreate, setSubmittingCreate] = useState(false)

  const canManage = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'

  const loadData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const [stocksRes, readinessRes] = await Promise.all([
        fetch('/api/admin/materials', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/materials/readiness', { headers: { Authorization: `Bearer ${token}` } }),
      ])

      const stocksData = await stocksRes.json()
      const readinessData = await readinessRes.json()

      if (!stocksData.success) {
        throw new Error(stocksData.error || 'Malzeme stokları yüklenemedi.')
      }
      if (!readinessData.success) {
        throw new Error(readinessData.error || 'Malzeme hazır oluş durumu yüklenemedi.')
      }

      setStocks(stocksData.materials || [])
      setReadiness(readinessData)
    } catch (err: any) {
      addToast(err.message || 'Veriler yüklenirken hata oluştu.', 'error')
    } finally {
      setLoading(false)
    }
  }, [token, addToast])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Handle Adjustment Submit
  const handleConfirmAdjust = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!adjustModalStock || adjustDelta === '' || adjustDelta === 0) return
    if (!adjustReason.trim()) {
      addToast('Lütfen düzeltme gerekçesini belirtin.', 'error')
      return
    }

    setSubmittingAdjust(true)
    try {
      const idempotencyKey = `adj-${adjustModalStock.id}-${Date.now()}`
      const deltaNumber = Number(adjustDelta)

      const res = await fetch(`/api/admin/materials/${adjustModalStock.id}/adjust`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deltaGrams: deltaNumber,
          type: adjustType,
          reason: adjustReason.trim(),
          reference: adjustReference.trim() || undefined,
          idempotencyKey,
        }),
      })

      const data = await res.json()
      if (!data.success) {
        addToast(data.error || 'Stok güncellenemedi.', 'error')
      } else {
        addToast(`Malzeme stoğu güncellendi (${deltaNumber > 0 ? '+' : ''}${deltaNumber} g).`, 'success')
        setAdjustModalStock(null)
        setAdjustDelta('')
        setAdjustReason('')
        setAdjustReference('')
        loadData()
      }
    } catch {
      addToast('İşlem sırasında bağlantı hatası oluştu.', 'error')
    } finally {
      setSubmittingAdjust(false)
    }
  }

  // Handle Create Material Submit
  const handleCreateMaterial = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMaterialName.trim()) return

    setSubmittingCreate(true)
    try {
      const res = await fetch('/api/admin/materials', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          materialName: newMaterialName.trim(),
          color: newColor.trim() || undefined,
          quantityGrams: Number(newQuantityGrams) || 0,
          minimumQuantityGrams: Number(newMinGrams) || 0,
          pricePerKgTl: Number(newPricePerKg) || undefined,
          location: newLocation.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (!data.success) {
        addToast(data.error || 'Malzeme eklenemedi.', 'error')
      } else {
        addToast('Yeni hammadde stoğu başarıyla oluşturuldu.', 'success')
        setShowCreateModal(false)
        setNewColor('')
        setNewLocation('')
        loadData()
      }
    } catch {
      addToast('Malzeme kaydı sırasında hata oluştu.', 'error')
    } finally {
      setSubmittingCreate(false)
    }
  }

  // Filtered stocks
  const filteredStocks = useMemo(() => {
    return stocks.filter((s) => {
      const matchSearch =
        s.materialName.toLowerCase().includes(search.toLowerCase()) ||
        (s.color && s.color.toLowerCase().includes(search.toLowerCase())) ||
        (s.location && s.location.toLowerCase().includes(search.toLowerCase()))
      if (!matchSearch) return false

      if (filterType !== 'ALL' && s.materialName.toUpperCase() !== filterType) return false
      return true
    })
  }, [stocks, search, filterType])

  // Computed metrics
  const totalWeightKg = useMemo(() => {
    const totalGrams = stocks.reduce((acc, s) => acc + s.quantityGrams, 0)
    return (totalGrams / 1000).toFixed(1)
  }, [stocks])

  const criticalCount = useMemo(() => {
    return stocks.filter((s) => s.quantityGrams <= s.minimumQuantityGrams).length
  }, [stocks])

  const blockersList = readiness?.blockers || []

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Hammadde & Filament Yönetimi</h1>
          <p className={styles.subtitle}>
            3D baskı filament stokları, üretim malzeme hazırlığı (readiness) ve atölye sarfiyatı.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => loadData()}
            disabled={loading}
          >
            Yenile
          </button>
          {canManage && (
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => setShowCreateModal(true)}
            >
              + Yeni Malzeme Ekle
            </button>
          )}
        </div>
      </div>

      {/* Metrics Strip */}
      <div className={styles.metricsStrip}>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Kayıtlı Malzeme</div>
          <div className={styles.metricValue}>{stocks.length}</div>
          <div className={styles.metricSub}>Aktif filament ve reçine profilleri</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Toplam Stok Ağırlığı</div>
          <div className={styles.metricValue} style={{ fontFamily: 'var(--font-mono)' }}>
            {totalWeightKg} <span style={{ fontSize: 14, fontWeight: 500 }}>kg</span>
          </div>
          <div className={styles.metricSub}>Atölye net hammadde hacmi</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Kritik Seviye</div>
          <div className={styles.metricValue} style={{ color: criticalCount > 0 ? 'var(--warning)' : 'inherit' }}>
            {criticalCount}
          </div>
          <div className={styles.metricSub}>Minimum eşiğin altına düşenler</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Üretim Darboğazı</div>
          <div className={styles.metricValue} style={{ color: blockersList.length > 0 ? 'var(--danger)' : 'var(--success)' }}>
            {blockersList.length}
          </div>
          <div className={styles.metricSub}>{blockersList.length > 0 ? 'Eksik filament nedeniyle bloke emir' : 'Tüm emirler üretilebilir'}</div>
        </div>
        <div className={styles.metricItem}>
          <div className={styles.metricLabel}>Bugünkü Sarfiyat Talebi</div>
          <div className={styles.metricValue} style={{ color: 'var(--zuu-blue, #0284c7)', fontFamily: 'var(--font-mono)' }}>
            {readiness?.todayRequiredGrams ? (readiness.todayRequiredGrams / 1000).toFixed(2) : '0.00'} <span style={{ fontSize: 14, fontWeight: 500 }}>kg</span>
          </div>
          <div className={styles.metricSub}>Kuyruktaki siparişler için gereken</div>
        </div>
      </div>

      {/* Blocker Alert Banner (if any product is blocked due to missing filament) */}
      {blockersList.length > 0 && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 6,
            padding: '14px 18px',
            marginBottom: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontWeight: 700, color: '#991b1b', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className={styles.tabDot} style={{ background: '#dc2626', width: 6, height: 6, borderRadius: '50%', display: 'inline-block' }} />
              <span>{blockersList.length} adet üretim emri yetersiz hammadde sebebiyle bekliyor</span>
            </div>
            <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 4 }}>
              Örn: {blockersList[0].productName} ({blockersList[0].materialName} / {blockersList[0].color || 'Doğal'}) için {blockersList[0].missingGrams} g ek filament gerekiyor.
            </div>
          </div>
          <Link
            href="/admin/production"
            className={`${styles.btn} ${styles.btnSecondary}`}
            style={{ fontSize: 12, padding: '4px 10px', borderColor: '#fca5a5', color: '#991b1b' }}
          >
            Üretim Masasına Git &rarr;
          </Link>
        </div>
      )}

      {/* Filters Bar */}
      <div className={styles.filterBar}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="search"
            placeholder="Malzeme adı, renk veya raf no ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.searchBox}
            style={{ width: 280 }}
          />

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className={styles.searchBox}
            style={{ fontSize: 12 }}
          >
            <option value="ALL">Tüm Polimer Tipleri</option>
            <option value="PLA">PLA</option>
            <option value="PETG">PETG</option>
            <option value="ABS">ABS</option>
            <option value="TPU">TPU</option>
            <option value="RESIN">Reçine</option>
          </select>
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Kayıtlı: <strong>{filteredStocks.length}</strong> / {stocks.length} malzeme
        </div>
      </div>

      {/* Materials Table */}
      <div className={styles.tableCard}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Malzeme verileri yükleniyor...
          </div>
        ) : filteredStocks.length === 0 ? (
          <div className={styles.emptyState}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
              Malzeme kaydı bulunamadı.
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Arama kriterlerine uygun hammadde bulunamadı. Yeni bir hammadde kaydı oluşturabilirsiniz.
            </div>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Malzeme / Polimer</th>
                  <th>Renk & Varyant</th>
                  <th style={{ textAlign: 'right' }}>Mevcut Miktar</th>
                  <th style={{ textAlign: 'right' }}>Kritik Eşik</th>
                  <th>Hazırlık (Readiness)</th>
                  <th>Birim Maliyet / Değer</th>
                  <th>Depo / Raf</th>
                  <th style={{ textAlign: 'right' }}>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {filteredStocks.map((s) => {
                  const isLow = s.quantityGrams <= s.minimumQuantityGrams
                  const readinessData = readiness?.materials?.find(
                    (m) =>
                      m.materialName.toLowerCase() === s.materialName.toLowerCase() &&
                      (m.color || '').toLowerCase() === (s.color || '').toLowerCase()
                  )
                  const readinessStatus = readinessData ? readinessData.status : isLow ? 'LOW' : 'READY'
                  const statusCfg = getMaterialReadinessStatusConfig(readinessStatus)

                  return (
                    <tr key={s.id}>
                      <td>
                        <Link
                          href={`/admin/materials/${s.id}`}
                          style={{ fontWeight: 600, color: 'var(--text-primary)', textDecoration: 'none' }}
                        >
                          {s.materialName}
                        </Link>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          #{s.id.slice(0, 8)}
                        </div>
                      </td>

                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              background: s.color ? s.color.toLowerCase() : '#ccc',
                              border: '1px solid var(--border)',
                              display: 'inline-block',
                            }}
                          />
                          <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                            {s.color || 'Doğal / Standart'}
                          </span>
                        </div>
                      </td>

                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                        <span style={{ fontWeight: 700, color: isLow ? 'var(--warning)' : 'var(--text-primary)' }}>
                          {s.quantityGrams.toLocaleString('tr-TR')} g
                        </span>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          ({(s.quantityGrams / 1000).toFixed(2)} kg)
                        </div>
                      </td>

                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                        {s.minimumQuantityGrams.toLocaleString('tr-TR')} g
                      </td>

                      <td>
                        <span className={`${styles.badge} ${statusCfg.badgeClass}`}>
                          {statusCfg.label}
                        </span>
                      </td>

                      <td style={{ fontSize: 12 }}>
                        {s.pricePerKgTl ? (
                          <div>
                            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                              ₺{s.pricePerKgTl}
                            </span>
                            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}> /kg</span>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              Toplam: ₺{(((s.quantityGrams / 1000) * s.pricePerKgTl)).toFixed(0)}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>

                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {s.location ? (
                          <span style={{ fontFamily: 'var(--font-mono)', background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 3 }}>
                            {s.location}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>Atölye Rafı</span>
                        )}
                      </td>

                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          {canManage && (
                            <button
                              type="button"
                              className={styles.secondaryBtn}
                              style={{ padding: '3px 8px', fontSize: 11 }}
                              onClick={() => {
                                setAdjustModalStock(s)
                                setAdjustDelta('')
                                setAdjustReason('')
                                setAdjustReference('')
                              }}
                            >
                              Giriş / Çıkış
                            </button>
                          )}
                          <Link
                            href={`/admin/materials/${s.id}`}
                            className={styles.secondaryBtn}
                            style={{ padding: '3px 8px', fontSize: 11, textDecoration: 'none' }}
                          >
                            Tarihçe &rarr;
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Manual Quantity Adjustment Modal */}
      {adjustModalStock && (
        <Modal
          isOpen={!!adjustModalStock}
          onClose={() => setAdjustModalStock(null)}
          ariaLabel="Malzeme Stok Düzeltmesi"
        >
          <form onSubmit={handleConfirmAdjust} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
              Malzeme Miktarını Güncelle
            </h3>

            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
              <strong>{adjustModalStock.materialName} ({adjustModalStock.color || 'Standart'})</strong> için fiziksel stok girişi veya sarfiyat düzeltmesi yapıyorsunuz.
              Mevcut Stok: <strong>{adjustModalStock.quantityGrams} g</strong>
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Hareket Tipi
                </label>
                <select
                  value={adjustType}
                  onChange={(e) => setAdjustType(e.target.value as any)}
                  className={styles.searchBox}
                  style={{ width: '100%', fontSize: 12 }}
                >
                  <option value="PURCHASE">Satın Alma Girişi (Purchase)</option>
                  <option value="MANUAL_ADJUSTMENT">Manuel Düzeltme (Sayım / Fire)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Değişim (Gram) (+ / -)
                </label>
                <input
                  type="number"
                  placeholder="Örn: +1000 veya -250"
                  value={adjustDelta}
                  onChange={(e) => setAdjustDelta(e.target.value === '' ? '' : Number(e.target.value))}
                  className={styles.searchBox}
                  style={{ width: '100%', fontSize: 13, fontFamily: 'var(--font-mono)' }}
                  required
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                Açıklama / Gerekçe (Zorunlu)
              </label>
              <textarea
                rows={2}
                placeholder="Örn: Yeni makara açıldı / test baskısı fire..."
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                className={styles.searchBox}
                style={{ width: '100%', fontSize: 12, resize: 'vertical' }}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                Fatura / İrsaliye No (Opsiyonel)
              </label>
              <input
                type="text"
                placeholder="Örn: IRS-2026-089"
                value={adjustReference}
                onChange={(e) => setAdjustReference(e.target.value)}
                className={styles.searchBox}
                style={{ width: '100%', fontSize: 12 }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setAdjustModalStock(null)}
                disabled={submittingAdjust}
              >
                Vazgeç
              </button>
              <button
                type="submit"
                className={styles.primaryBtn}
                disabled={submittingAdjust || adjustDelta === '' || !adjustReason.trim()}
              >
                {submittingAdjust ? 'Kaydediliyor...' : 'Stoku Güncelle'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* New Material Modal */}
      {showCreateModal && (
        <Modal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          ariaLabel="Yeni Hammadde Ekle"
        >
          <form onSubmit={handleCreateMaterial} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
              Yeni Hammadde / Filament Tanımla
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Polimer / Malzeme Tipi *
                </label>
                <input
                  type="text"
                  placeholder="Örn: PLA, PETG, TPU"
                  value={newMaterialName}
                  onChange={(e) => setNewMaterialName(e.target.value)}
                  className={styles.searchBox}
                  style={{ width: '100%', fontSize: 13 }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Renk / Varyant
                </label>
                <input
                  type="text"
                  placeholder="Örn: Mat Siyah, Şeffaf Sarı"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  className={styles.searchBox}
                  style={{ width: '100%', fontSize: 13 }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Başlangıç Stoğu (Gram)
                </label>
                <input
                  type="number"
                  placeholder="1000"
                  value={newQuantityGrams}
                  onChange={(e) => setNewQuantityGrams(e.target.value === '' ? '' : Number(e.target.value))}
                  className={styles.searchBox}
                  style={{ width: '100%', fontSize: 13, fontFamily: 'var(--font-mono)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Kritik Eşik (Gram)
                </label>
                <input
                  type="number"
                  placeholder="1000"
                  value={newMinGrams}
                  onChange={(e) => setNewMinGrams(e.target.value === '' ? '' : Number(e.target.value))}
                  className={styles.searchBox}
                  style={{ width: '100%', fontSize: 13, fontFamily: 'var(--font-mono)' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Kg Başına Maliyet (TL)
                </label>
                <input
                  type="number"
                  placeholder="350"
                  value={newPricePerKg}
                  onChange={(e) => setNewPricePerKg(e.target.value === '' ? '' : Number(e.target.value))}
                  className={styles.searchBox}
                  style={{ width: '100%', fontSize: 13, fontFamily: 'var(--font-mono)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                  Depo / Raf Kodu
                </label>
                <input
                  type="text"
                  placeholder="Örn: RAF-A1-02"
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  className={styles.searchBox}
                  style={{ width: '100%', fontSize: 13 }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setShowCreateModal(false)}
                disabled={submittingCreate}
              >
                Vazgeç
              </button>
              <button
                type="submit"
                className={styles.primaryBtn}
                disabled={submittingCreate || !newMaterialName.trim()}
              >
                {submittingCreate ? 'Oluşturuluyor...' : 'Hammaddeyi Kaydet'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
